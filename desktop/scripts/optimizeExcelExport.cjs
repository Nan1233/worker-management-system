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

writeIfChanged(workbookPath, workbookBefore, workbook);

// 4) main.cjs: không chờ token hai lần trong cùng một lần bấm xuất.
// 5) main.cjs: nếu backend lỗi, trả đúng lỗi backend thay vì lỗi phụ
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
console.log('Changes: only non-empty process workbooks, no GC helper sheet, no duplicate border pass, no duplicate token wait, and no secondary companyData error.');
