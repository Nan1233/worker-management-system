const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const JSZip = require('jszip');
const ExcelJS = require('exceljs');
const { buildProcessExcelLocal, _private } = require('../electron/companyExcelLocal.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const templateRoot = path.join(repoRoot, 'backend', 'templates');

async function normalizeAbsoluteRelationshipTargets(inputBuffer) {
  const zip = await JSZip.loadAsync(inputBuffer);
  for (const relationshipPath of Object.keys(zip.files).filter((name) => name.endsWith('.rels'))) {
    const match = /^(.*)\/_rels\/([^/]+)\.rels$/.exec(relationshipPath);
    const sourcePart = relationshipPath === '_rels/.rels' ? '' : (match ? `${match[1]}/${match[2]}` : '');
    const sourceDirectory = path.posix.dirname(sourcePart);
    const xml = await zip.file(relationshipPath).async('string');
    const normalized = xml.replace(/Target="([^"]+)"/g, (whole, target) => {
      if (!target.startsWith('/')) return whole;
      const absoluteTarget = target.replace(/^\/+/, '').split(/[?#]/, 1)[0];
      const relativeTarget = sourceDirectory === '.' ? absoluteTarget : path.posix.relative(sourceDirectory, absoluteTarget);
      return `Target="${relativeTarget}${target.slice(absoluteTarget.length + 1)}"`;
    });
    if (normalized !== xml) zip.file(relationshipPath, normalized);
  }
  // ExcelJS 4.4.0 crashes in reconcile() when a drawing .rels part exists
  // without its matching drawing XML. Such orphan relationships carry no
  // renderable drawing; remove only those orphan .rels entries in-memory.
  for (const relationshipPath of Object.keys(zip.files)) {
    const drawingRelsPrefix = 'xl/drawings/_rels/';
    const drawingRelsSuffix = '.xml.rels';
    if (relationshipPath.startsWith(drawingRelsPrefix) && relationshipPath.endsWith(drawingRelsSuffix)) {
      const drawingName = relationshipPath.slice(drawingRelsPrefix.length, -drawingRelsSuffix.length);
      if (!zip.file(`xl/drawings/${drawingName}.xml`)) zip.remove(relationshipPath);
    }
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function readRawWorkbook(fileOrBuffer) {
  const input = typeof fileOrBuffer === 'string' ? fs.readFileSync(fileOrBuffer) : fileOrBuffer;
  const zip = await JSZip.loadAsync(input);
  const workbookXml = await zip.file('xl/workbook.xml').async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const relTargets = {};
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = Object.fromEntries([...match[1].matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    if (attrs.Id && attrs.Target) relTargets[attrs.Id] = attrs.Target.replace(/^\//, '').replace(/^xl\//, '');
  }
  const sheets = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = Object.fromEntries([...match[1].matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const target = relTargets[attrs['r:id']];
    if (!target) continue;
    const sheetPath = target.startsWith('worksheets/') ? `xl/${target}` : `xl/worksheets/${target}`;
    const xml = await zip.file(sheetPath).async('string');
    sheets.push({ name: attrs.name, state: attrs.state || 'visible', xml });
  }
  const stylesXml = await zip.file('xl/styles.xml').async('string');
  return { sheets, stylesXml };
}

function rawFormulaCount(xml) {
  return (xml.match(/<f(?:\s|>)/g) || []).length;
}

function columnName(number) {
  let name = '';
  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
}

async function readExcelJsWorkbook(fileOrBuffer) {
  const input = typeof fileOrBuffer === 'string' ? fs.readFileSync(fileOrBuffer) : fileOrBuffer;
  const compatible = await _private.normalizeAbsoluteRelationshipTargets(input);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(compatible);
  return workbook;
}

function styleSnapshot(sheet, maxRow = 12, maxColumn = 49) {
  const result = {};
  for (let row = 1; row <= maxRow; row += 1) {
    for (let column = 1; column <= maxColumn; column += 1) {
      const address = `${columnName(column)}${row}`;
      result[address] = JSON.parse(JSON.stringify(sheet.getCell(address).style || {}));
    }
  }
  return result;
}
const cases = [
  { code: 'MAI', file: 'TT_MAI_TEMPLATE.xlsx', sheet: 'TT Mài' },
  { code: 'DO', file: 'TT_DO_TEMPLATE.xlsx', sheet: 'TT Đo' }
];

for (const item of cases) {
  test(`${item.code}: xuất từ đúng template gốc và giữ nguyên công thức/style/sheet`, async () => {
    const sourcePath = path.join(templateRoot, item.file);
    assert.ok(fs.existsSync(sourcePath), `Thiếu template test: ${sourcePath}`);

    const originalRaw = await readRawWorkbook(sourcePath);
    const originalRawSheet = originalRaw.sheets.find((sheet) => sheet.name === item.sheet);
    assert.ok(originalRawSheet, `Template gốc thiếu sheet ${item.sheet}`);
    const originalSheetStates = originalRaw.sheets.map((sheet) => [sheet.name, sheet.state]);

    const built = await buildProcessExcelLocal({
      appPath: path.join(repoRoot, 'desktop'),
      date: '2026-10-01',
      processCode: item.code,
      payload: { groups: { MAI_DO: { processes: [] } } }
    });

    assert.equal(path.resolve(built.sourcePath), path.resolve(sourcePath),
      'Không được lấy template cùng tên từ thư mục khác hoặc bản cũ');
    assert.equal(built.fileName, item.code === 'MAI' ? '05_MAI_10-2026.xlsx' : '06_DO_10-2026.xlsx');

    // Inspect OOXML for workbook structure/formulas, and use ExcelJS's effective
    // style model for formatting parity after the same relationship normalization.
    const outputRaw = await readRawWorkbook(built.buffer);
    const outputRawSheet = outputRaw.sheets.find((sheet) => sheet.name === item.sheet);
    assert.ok(outputRawSheet, `Workbook xuất thiếu sheet ${item.sheet}`);
    assert.deepEqual(outputRaw.sheets.filter((sheet) => sheet.name !== '_KTC_META')
      .map((sheet) => [sheet.name, sheet.state]), originalSheetStates,
      'Không được ẩn/hiện hoặc đổi trạng thái các sheet gốc');
    assert.equal(rawFormulaCount(outputRawSheet.xml), rawFormulaCount(originalRawSheet.xml),
      'Không được xóa công thức trong sheet template');
    // Compare ExcelJS's effective style objects after applying the same compatibility
    // normalization to both workbooks. Raw OOXML IDs/attribute order are serializer
    // details and can change during a valid ExcelJS round-trip.
    const originalWorkbook = await readExcelJsWorkbook(sourcePath);
    const outputWorkbook = await readExcelJsWorkbook(built.buffer);
    const originalStyleSheet = originalWorkbook.getWorksheet(item.sheet);
    const outputStyleSheet = outputWorkbook.getWorksheet(item.sheet);
    assert.ok(originalStyleSheet, `ExcelJS không đọc được sheet gốc ${item.sheet}`);
    assert.ok(outputStyleSheet, `ExcelJS không đọc được sheet xuất ${item.sheet}`);
    const originalStyles = styleSnapshot(originalStyleSheet);
    const outputStyles = styleSnapshot(outputStyleSheet);
    for (const [address, style] of Object.entries(originalStyles)) {
      assert.deepEqual(outputStyles[address], style,
        `Định dạng hiệu lực ô ${address} bị thay đổi so với template`);
    }
  });
}

test('Mài và Đo phải dùng hai template khác nhau', () => {
  const mai = fs.readFileSync(path.join(templateRoot, 'TT_MAI_TEMPLATE.xlsx'));
  const doTemplate = fs.readFileSync(path.join(templateRoot, 'TT_DO_TEMPLATE.xlsx'));
  assert.notDeepEqual(mai, doTemplate, 'Template Mài và Đo không được dùng chung một workbook');
});
