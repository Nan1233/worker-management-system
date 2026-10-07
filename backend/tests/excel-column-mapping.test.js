const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const headers = require('./fixtures/excel-template-headers.json');
const master = require('../config/ktcTemplateMasterData.js');
const { buildLayoutResolvers, createColumnResolver, writeDetailColumns } = require('../services/excelColumnMapping');
const { LAYOUTS } = require('../config/excelLayouts');

const masterData = (master.KTC_TEMPLATE_MASTER_DATA || master.default || master);
const processes = masterData.processes || masterData;
const templates = {
  GIA_CONG: { file: 'bao-cao-cat-long-export.xlsx', sheet: 'Cắt lồng', process: 'GC' },
  MAI: { file: 'bao-cao-mai-do-export.xlsx', sheet: 'TT Mài', process: 'MAI' },
  DO: { file: 'bao-cao-mai-do-export.xlsx', sheet: 'TT Đo', process: 'DO' }
};
// Header labels of the bundled company templates (labels only, no data). Keeps the
// test fast: the real workbooks are 2-7 MB each.
async function loadSheet(file, sheet) {
  const { labelRow, labels } = headers[sheet];
  return { getRow: (row) => ({ getCell: (col) => ({ value: row === labelRow ? (labels[col] ?? null) : null }) }) };
}

for (const [layoutCode, cfg] of Object.entries(templates)) {
  test(`${layoutCode}: every master deduction maps to exactly one template column`, async () => {
    const sheet = await loadSheet(cfg.file, cfg.sheet);
    const { resolveDeduction } = buildLayoutResolvers(sheet, LAYOUTS[layoutCode], layoutCode);
    const names = processes[cfg.process].deductions;
    const columns = names.map((name) => resolveDeduction({ deduction_name: name }));
    assert.deepEqual(names.filter((_, i) => !columns[i]), [], 'master deduction names with no template column');
    assert.equal(new Set(columns).size, names.length, 'two master deductions share one column');
  });
}

test('MAI and DO: every master defect maps to a template column', async () => {
  for (const code of ['MAI', 'DO']) {
    const cfg = templates[code];
    const sheet = await loadSheet(cfg.file, cfg.sheet);
    const { resolveDefect } = buildLayoutResolvers(sheet, LAYOUTS[code], code);
    const unmapped = processes[code].defects.filter((name) => !resolveDefect({ defect_name: name }));
    assert.deepEqual(unmapped, [], `${code} defects without a column`);
  }
});

test('GC: header restored to 19 defect columns through BB and deductions are the 16 types in template order', async () => {
  const sheet = await loadSheet(templates.GIA_CONG.file, templates.GIA_CONG.sheet);
  const mapping = buildLayoutResolvers(sheet, LAYOUTS.GIA_CONG, 'GIA_CONG');
  assert.equal(mapping.deductionColumns.length, 16);
  assert.equal(mapping.defectColumns.length, 19);
  assert.equal(mapping.defectColumns.at(-1).column, 54);
  assert.equal(mapping.defectColumns.at(-1).label, 'thiếu cao su');
  const order = processes.GC.deductions.map((name) => mapping.resolveDeduction({ deduction_name: name }));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'master order must equal template column order');
});

test('writeReportRow places values by header, not by array position', async () => {
  const sheet = await loadSheet(templates.GIA_CONG.file, templates.GIA_CONG.sheet);
  const mapping = {
    ...buildLayoutResolvers(sheet, LAYOUTS.GIA_CONG, 'GIA_CONG'),
    deductionNameById: new Map([[7, 'Mất điện'], [3, 'Thiếu sản lượng']]),
    defectNameById: new Map(),
    unmapped: []
  };
  // Only 2 of 16 types present, and listed out of template order.
  const report = {
    id: 1, worker_code: '947', shift: 'A', total_time: 8, tt_ok: 100, work_date: '2026-09-03',
    deductions: [{ deduction_type_id: 7, hours: 0.5 }, { deduction_type_id: 3, hours: 0.25 }],
    defects: [{ defect_name: 'CAT02 - Cắt không đứt', quantity: 2 }, { defect_name: 'Cao su vỡ', quantity: 1 }, { defect_name: 'Cắt phạm', quantity: 4 }]
  };
  const target = new ExcelJS.Workbook().addWorksheet('t');
  writeDetailColumns(target.getRow(10), report, mapping);
  const cell = (col) => target.getRow(10).getCell(col).value;
  assert.equal(cell(11), 0.25, 'Thiếu sản lượng -> K');
  assert.equal(cell(16), 0.5, 'Mất điện -> P');
  assert.equal(cell(12), 0, 'Bật máy, xét máy stays 0');
  assert.equal(cell(40), 2, 'Cắt không đứt -> AN (code prefix ignored)');
  assert.equal(cell(37), 1, 'Cao su vỡ -> Vỡ cao su (AK)');
  assert.deepEqual(mapping.unmapped.map((u) => u.name), ['Cắt phạm'], 'no guessed column for unknown defect');
});

test('resolver does not guess on short or ambiguous names', () => {
  const resolve = createColumnResolver([{ column: 1, key: 'khac' }, { column: 2, key: 'khac nua' }]);
  assert.equal(resolve({ defect_name: 'Kh' }), null);
});
