const fs = require('node:fs');
const path = require('node:path');

const launcherPath = path.resolve(__dirname, '..', 'electron', 'launcher.cjs');
const source = fs.readFileSync(launcherPath, 'utf8');

if (source.includes("const monthlyPath = require.resolve('./monthlyWorkbookLocal.cjs');")) {
  console.log('[KTC] Excel performance patch already applied.');
  process.exit(0);
}

const marker = "  const mainPath = require.resolve('./main.cjs');\n";
if (!source.includes(marker)) {
  throw new Error('Không tìm thấy vị trí patch launcher.cjs. Không thay đổi file.');
}

const injected = `${marker}  const monthlyPath = require.resolve('./monthlyWorkbookLocal.cjs');\n`;
let patched = source.replace(marker, injected);

const oldLoader = `  Module._extensions['.cjs'] = function loadCjsWithExcelScopeHotfix(module, filename) {\n    if (path.resolve(filename) !== path.resolve(mainPath)) {\n      return originalCjsLoader(module, filename);\n    }\n\n    let source = fs.readFileSync(filename, 'utf8');\n    const buggyBlock = \`  const expectedFileCount = Object.entries(companyData?.processes || {})\\n    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0).length;\`;\n    const fixedBlock = \`  const expectedFileCount = files.filter((file) => file.category === 'MONTHLY_PROCESS').length;\`;\n\n    if (source.includes(buggyBlock)) {\n      source = source.replace(buggyBlock, fixedBlock);\n      void writeLauncherLog('INFO', 'MAIN_EXCEL_SCOPE_HOTFIX_APPLIED', {\n        file: filename,\n        replacement: 'companyData-scope -> generated-monthly-process-count'\n      });\n    } else {\n      void writeLauncherLog('INFO', 'MAIN_EXCEL_SCOPE_HOTFIX_NOT_NEEDED', { file: filename });\n    }\n\n    return module._compile(source, filename);\n  };`;

const newLoader = `  Module._extensions['.cjs'] = function loadCjsWithExcelScopeHotfix(module, filename) {\n    const resolvedFilename = path.resolve(filename);\n    const resolvedMain = path.resolve(mainPath);\n    const resolvedMonthly = path.resolve(monthlyPath);\n    if (resolvedFilename !== resolvedMain && resolvedFilename !== resolvedMonthly) {\n      return originalCjsLoader(module, filename);\n    }\n\n    let source = fs.readFileSync(filename, 'utf8');\n\n    if (resolvedFilename === resolvedMonthly) {\n      const helperPattern = /\\s*addGcModeHelperSheet\\(workbook, workbook\\.getWorksheet\\(config\\.sheet\\), processData, makeColumns\\(code, deductionTypes, defectTypes\\)\\);/;\n      const borderPattern = /\\s*applyAllBorders\\(sheet, \\{ fromRow: 4, toRow: rowNumber - 1, fromCol: 1, toCol: columns\\.length \\}\\);/;\n      const helperMatched = helperPattern.test(source);\n      const borderMatched = borderPattern.test(source);\n      if (helperMatched) source = source.replace(helperPattern, '\\n');\n      if (borderMatched) source = source.replace(borderPattern, '\\n');\n      void writeLauncherLog('INFO', 'MONTHLY_EXCEL_PERF_PATCH', {\n        helperSheetRemoved: helperMatched,\n        redundantBorderPassRemoved: borderMatched\n      });\n    }\n\n    if (resolvedFilename === resolvedMain) {\n      const buggyBlock = \`  const expectedFileCount = Object.entries(companyData?.processes || {})\\n    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0).length;\`;\n      const fixedBlock = \`  const expectedFileCount = files.filter((file) => file.category === 'MONTHLY_PROCESS').length;\`;\n      const matched = source.includes(buggyBlock);\n      if (matched) source = source.replace(buggyBlock, fixedBlock);\n      void writeLauncherLog('INFO', matched ? 'MAIN_EXCEL_SCOPE_HOTFIX_APPLIED' : 'MAIN_EXCEL_SCOPE_HOTFIX_NOT_NEEDED', {\n        file: filename,\n        replacement: matched ? 'companyData-scope -> generated-monthly-process-count' : null\n      });\n    }\n\n    return module._compile(source, filename);\n  };`;

if (!patched.includes(oldLoader)) {
  throw new Error('Không tìm thấy loader hiện tại để thay thế. Không thay đổi file.');
}
patched = patched.replace(oldLoader, newLoader);

const backupPath = `${launcherPath}.backup-before-excel-perf-patch`;
if (!fs.existsSync(backupPath)) fs.copyFileSync(launcherPath, backupPath);
fs.writeFileSync(launcherPath, patched, 'utf8');
console.log('[KTC] Applied Excel performance patch to launcher.cjs');
console.log('[KTC] Backup:', backupPath);
