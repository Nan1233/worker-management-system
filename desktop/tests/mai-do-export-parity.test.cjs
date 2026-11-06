const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const JSZip = require('jszip');
const { buildProcessExcelLocal } = require('../electron/companyExcelLocal.cjs');

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

function rawCellXfs(stylesXml) {
  const section = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] || '';
  return [...section.matchAll(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g)]
    .map((match) => match[0].replace(/\s+/g, ' ').trim());
}

function rawFormulaCount(xml) {
  return (xml.match(/<f(?:\s|>)/g) || []).length;
}

function rawStyleSnapshot(xml, cellXfs, maxRow = 12, maxColumn = 49) {
  const result = {};
  for (const match of xml.matchAll(/<c\b([^>]*)\/?>/g)) {
    const attrs = Object.fromEntries([...match[1].matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const cell = /^([A-Z]+)(\d+)$/.exec(attrs.r || '');
    if (!cell || Number(cell[2]) > maxRow) continue;
    let column = 0;
    for (const char of cell[1]) column = column * 26 + char.charCodeAt(0) - 64;
    if (column > maxColumn) continue;
    const styleIndex = Number(attrs.s || 0);
    result[attrs.r] = cellXfs[styleIndex] || cellXfs[0] || '';
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
    const originalRawXfs = rawCellXfs(originalRaw.stylesXml);
    const originalRawStyles = rawStyleSnapshot(originalRawSheet.xml, originalRawXfs);

    const built = await buildProcessExcelLocal({
      appPath: path.join(repoRoot, 'desktop'),
      date: '2026-10-01',
      processCode: item.code,
      payload: { groups: { MAI_DO: { processes: [] } } }
    });

    assert.equal(path.resolve(built.sourcePath), path.resolve(sourcePath),
      'Không được lấy template cùng tên từ thư mục khác hoặc bản cũ');
    assert.equal(built.fileName, item.code === 'MAI' ? '05_MAI_10-2026.xlsx' : '06_DO_10-2026.xlsx');

    // Inspect the generated OOXML directly. ExcelJS 4.4.0 cannot reliably
    // re-open this legacy template's drawing relationships after its own
    // writeBuffer() round-trip; this is a reader limitation, not an export
    // failure. Raw XML checks avoid that second parser pass.
    const outputRaw = await readRawWorkbook(built.buffer);
    const outputRawSheet = outputRaw.sheets.find((sheet) => sheet.name === item.sheet);
    assert.ok(outputRawSheet, `Workbook xuất thiếu sheet ${item.sheet}`);
    assert.deepEqual(outputRaw.sheets.filter((sheet) => sheet.name !== '_KTC_META')
      .map((sheet) => [sheet.name, sheet.state]), originalSheetStates,
      'Không được ẩn/hiện hoặc đổi trạng thái các sheet gốc');
    assert.equal(rawFormulaCount(outputRawSheet.xml), rawFormulaCount(originalRawSheet.xml),
      'Không được xóa công thức trong sheet template');
    const outputRawXfs = rawCellXfs(outputRaw.stylesXml);
    const outputRawStyles = rawStyleSnapshot(outputRawSheet.xml, outputRawXfs);
    for (const [address, style] of Object.entries(originalRawStyles)) {
      assert.equal(outputRawStyles[address], style, `Style OOXML thực tế ô ${address} bị thay đổi so với template`);
    }
  });
}

test('Mài và Đo phải dùng hai template khác nhau', () => {
  const mai = fs.readFileSync(path.join(templateRoot, 'TT_MAI_TEMPLATE.xlsx'));
  const doTemplate = fs.readFileSync(path.join(templateRoot, 'TT_DO_TEMPLATE.xlsx'));
  assert.notDeepEqual(mai, doTemplate, 'Template Mài và Đo không được dùng chung một workbook');
});
