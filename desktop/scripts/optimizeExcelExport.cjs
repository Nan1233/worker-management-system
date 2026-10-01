const fs = require('fs');
const path = require('path');

const desktopDir = path.resolve(__dirname, '..');
const electronDir = path.join(desktopDir, 'electron');
const workbookPath = path.join(electronDir, 'monthlyWorkbookLocal.cjs');
const mainPath = path.join(electronDir, 'main.cjs');

function replaceOnce(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`Không tìm thấy đoạn cần sửa: ${label}`);
  return next;
}

function writeIfChanged(file, before, after) {
  if (before === after) return false;
  fs.writeFileSync(file, after, 'utf8');
  console.log(`[PASS] Patched ${path.relative(process.cwd(), file)}`);
  return true;
}

// 1) Chỉ build workbook cho công đoạn có báo cáo. Không build summary workbook
// vì performSync chỉ ghi các workbook công đoạn; summary trước đây là chi phí thừa.
let workbook = fs.readFileSync(workbookPath, 'utf8');
const workbookBefore = workbook;
workbook = replaceOnce(
  workbook,
  /async function buildSplitMonthlyWorkbooksLocal\(\{ date, payload \}\) \{[\s\S]*?\n\}\n\nasync function buildReconciliationWorkbook/s,
`async function buildSplitMonthlyWorkbooksLocal({ date, payload }) {
  assertApprovedDatabasePayload(payload);
  const processes = [];
  for (const [code, processData] of Object.entries(payload.processes || {})) {
    if (!Array.isArray(processData?.reports) || processData.reports.length === 0) continue;
    if (!PROCESS_SHEETS[code]) continue;
    processes.push(await buildProcessWorkbookLocal({ date, payload, processCode: code }));
  }
  return { summary: null, processes };
}

async function buildReconciliationWorkbook`,
  'buildSplitMonthlyWorkbooksLocal'
);

// 2) GC không tạo sheet helper 2.000 dòng công thức nữa. Các trường CẮT/LỒNG,
// CHẾ ĐỘ và MÁY đã nằm trực tiếp trên sheet chính; bỏ helper giúp giảm mạnh
// số cell/style/formula phải serialize.
workbook = replaceOnce(
  workbook,
  /\n  if \(code === 'GC'\) \{\n    const deductionTypes = processDetailTypes\(code, processData, 'deductionTypes', 'deductions', 'deduction'\);\n    const defectTypes = processDetailTypes\(code, processData, 'defectTypes', 'defects', 'defect'\);\n    addGcModeHelperSheet\(workbook, workbook\.getWorksheet\(config\.sheet\), processData, makeColumns\(code, deductionTypes, defectTypes\)\);\n  \}/,
  '',
  'GC helper sheet'
);

// 3) Mỗi ô dữ liệu đã được applyCellStyle() và có border sẵn; vòng
// applyAllBorders() lần hai chỉ lặp lại hàng trăm nghìn cell.
workbook = replaceOnce(
  workbook,
  /\n  \/\/ All Borders cho toàn bộ vùng bảng: header nhóm, header cột, hàng ngày, dữ liệu và tổng cộng\.\n  applyAllBorders\(sheet, \{ fromRow: 4, toRow: totalRowNumber, fromCol: 1, toCol: lastColumn \}\);/,
  '',
  'duplicate render borders'
);

// 4) Không tạo Set editableCore cho từng cell. Tạo một lần cho từng report.
workbook = replaceOnce(
  workbook,
  /\n      const machineMode = asText\(report\.operation_mode\)\.toUpperCase\(\) === 'MACHINE';\n      const editableCore = machineMode\n        \? new Set\(\['training','note'\]\)\n        : new Set\(\['shift','machine','product','training','actualTime','ok','note'\]\);\n      const editableCell = editableCore\.has\(column\.key\) \|\| \(!machineMode && \(column\.key\.startsWith\('deduction:'\) \|\| column\.key\.startsWith\('defect:'\)\)\);/,
  `\n    const machineMode = asText(report.operation_mode).toUpperCase() === 'MACHINE';
    const editableCore = machineMode
      ? new Set(['training','note'])
      : new Set(['shift','machine','product','training','actualTime','ok','note']);

    columns.forEach((column, columnIndex) => {
      const cell = sheet.getCell(rowNumber, columnIndex + 1);
      const value = values[column.key];
      cell.value = value === undefined ? null : value;
      if (column.format) cell.numFmt = resolvedNumberFormat(value, column.format);
      const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null;
      // Rule tháng 07/2026: nền dữ liệu mặc định trắng, không zebra/rainbow.
      // Chỉ các chỉ số tổng hợp chính mới có màu cố định; chi tiết trừ giờ/NG luôn nền trắng.
      let fill = COLORS.white;
      let bold = false;
      let fontColor = COLORS.black;
      const editableCell = editableCore.has(column.key) || (!machineMode && (column.key.startsWith('deduction:') || column.key.startsWith('defect:')));`,
  'editable Set per cell'
);

// The replacement above intentionally restores the columns.forEach header/body,
// so remove the now-duplicated old columns.forEach opening/body prelude if present.
workbook = workbook.replace(
  /\n    columns\.forEach\(\(column, columnIndex\) => \{\n      const cell = sheet\.getCell\(rowNumber, columnIndex \+ 1\);\n      const value = values\[column\.key\];\n      cell\.value = value === undefined \? null : value;\n      if \(column\.format\) cell\.numFmt = resolvedNumberFormat\(value, column\.format\);\n      const numericValue = typeof value === 'number' && Number\.isFinite\(value\) \? value : null;\n      \/\/ Rule tháng 07\/2026: nền dữ liệu mặc định trắng, không zebra\/rainbow\.\n      \/\/ Chỉ các chỉ số tổng hợp chính mới có màu cố định; chi tiết trừ giờ\/NG luôn nền trắng\.\n      let fill = COLORS\.white;\n      let bold = false;\n      let fontColor = COLORS\.black;\n      const machineMode = asText\(report\.operation_mode\)\.toUpperCase\(\) === 'MACHINE';\n      const editableCore = machineMode\n        \? new Set\(\['training','note'\]\)\n        : new Set\(\['shift','machine','product','training','actualTime','ok','note'\]\);\n      const editableCell = editableCore\.has\(column\.key\) \|\| \(!machineMode && \(column\.key\.startsWith\('deduction:'\) \|\| column\.key\.startsWith\('defect:'\)\)\);/,
  ''
);

writeIfChanged(workbookPath, workbookBefore, workbook);

// 5) main.cjs: không chờ token hai lần trong cùng một lần bấm xuất.
// 6) main.cjs: nếu backend lỗi, trả đúng lỗi backend thay vì lỗi phụ
// "companyData is not defined" sau catch.
let main = fs.readFileSync(mainPath, 'utf8');
const mainBefore = main;
main = replaceOnce(
  main,
  /  const files = \[\];\n  try \{/,
  `  const files = [];
  let companyData = null;
  try {`,
  'companyData declaration'
);
main = replaceOnce(
  main,
  /    const companyData = await fetchCompanyData\(date\);/,
  `    companyData = await fetchCompanyData(date);`,
  'companyData assignment'
);
main = replaceOnce(
  main,
  /  const token = await waitForUsableRendererToken\('', 8_000\);\n  if \(!token\) throw new Error\('Chưa đăng nhập hoặc phiên đăng nhập chưa được làm mới\.'\);\n  currentToken = token;/,
  `  const token = currentToken || await waitForUsableRendererToken('', 8_000);
  if (!token) throw new Error('Chưa đăng nhập hoặc phiên đăng nhập chưa được làm mới.');
  currentToken = token;`,
  'duplicate token wait'
);
main = replaceOnce(
  main,
  /  const expectedFileCount = Object\.entries\(companyData\?\.processes \|\| \{\}\)\n    \.filter\(\(\[, data\]\) => Array\.isArray\(data\?\.reports\) && data\.reports\.length > 0\)\.length;/,
  `  if (!companyData) {
    const result = {
      success: false,
      partialSuccess: false,
      message: files[0]?.error || 'Không thể lấy dữ liệu approved từ backend.',
      date,
      files,
      rootFolder: root,
      savedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      excelEngine: 'desktop-local',
      backendRole: 'approved-data-only'
    };
    await writeLog('INFO', 'SYNC_FINISH', {
      source,
      date,
      fileCount: files.length,
      success: false,
      excelEngine: 'desktop-local',
      elapsedMs: result.elapsedMs
    });
    return result;
  }

  const expectedFileCount = Object.entries(companyData?.processes || {})
    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0).length;`,
  'companyData failure guard'
);
writeIfChanged(mainPath, mainBefore, main);

console.log('[PASS] Excel export optimization patch applied.');
console.log('Next: run the desktop smoke test/build on test-excel-db-fix-clean.');
