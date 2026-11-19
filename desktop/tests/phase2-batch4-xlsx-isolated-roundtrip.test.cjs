'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const {
  buildSplitMonthlyWorkbooksLocal, PROCESS_SHEETS, PROCESS_FILE_PREFIXES,
  EXCEL_CONTRACT_VERSION,
} = require('../electron/monthlyWorkbookLocal.cjs');
const { readExcelChanges } = require('../electron/excelDbSync.cjs');
const { WORKBOOK1_FORMS } = require('../electron/originalProcessExcelTemplate.cjs');

// Only synthetic rows and a new, disposable OS temporary directory may be
// written. This test never resolves the normal KTC export root or NAS.
const MONTH = '2026-11';
const DATE = '2026-11-10';
const fixture = (code, n) => ({
  id: 24000 + n,
  worker_id: 49001 + n,
  worker_code: 'QA-' + String(n).padStart(3,'0'),
  full_name: 'Synthetic isolated fixture',
  process_code: code,
  work_date: DATE,
  entry_date: DATE,
  created_at: '2026-11-10T09:00:00.000Z',
  updated_at: '2026-11-10T10:00:00.000Z',
  shift: 'A',
  operation_mode: 'MANUAL',
  operation_type: 'CUT',
  machine_no: 'QA-M01',
  product_name: 'QA-P01',
  training_percent_snapshot: 75,
  training_percent: 75,
  standard_output: 100,
  total_time: 8,
  deduction_time: 1,
  actual_time: 7,
  actual_output: 100,
  tt_ok: 98,
  tt_ng: 2,
  status: 'approved',
  dataSource: 'production_reports',
  isApprovedDatabaseRecord: true,
  note: 'Synthetic fixture only',
  calculationSnapshot: {
    trainingPercent: 75, trainingFactor: 0.75,
    standard: 100, workingTime: 8, actualTime: 7, deductionTime: 1,
    ok: 98, allNg: 2, countedNg: 2, enteredOutput: 100,
    adjustedOutput: 75, plannedOutput: 525, outputPerHour: 75 / 7,
    achievement: 75 / 525, ngRate: 0.02,
  },
  defects: [],
  deductions: [],
});

test('split export round-trips all 11 actual XLSX buffers in a disposable folder, including _KTC_SYNC lineage', async () => {
  const codes = Object.keys(PROCESS_SHEETS);
  assert.equal(codes.length, 10);
  const payload = {
    yearMonth: MONTH,
    dataSource: 'tidb.production_reports.approved',
    processes: Object.fromEntries(codes.map((code,i) => [
      code, { reports: [fixture(code,i + 1)], deductionTypes: [], defectTypes: [] },
    ])),
  };

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-phase2-batch4-'));
  try {
    const { summary, processes } = await buildSplitMonthlyWorkbooksLocal({date:DATE,payload});
    assert.equal(processes.length, codes.length);
    const names = new Set();
    for (const item of [summary, ...processes]) {
      assert.match(item.fileName, /_11-2026\.xlsx$/);
      assert.ok(!names.has(item.fileName), 'duplicate workbook name: ' + item.fileName);
      names.add(item.fileName);
      const destination = path.join(directory, path.basename(item.fileName));
      assert.equal(path.dirname(destination), directory, 'write must stay within unique OS temp directory');
      await fs.writeFile(destination, item.buffer, { flag:'wx' });
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(destination);
      assert.ok(wb.worksheets.length);
      if (item === summary) {
        for (const sheet of ['BÌA','TỔNG HỢP THÁNG','ĐỐI CHIẾU DỮ LIỆU']) {
          assert.ok(wb.getWorksheet(sheet), 'missing monthly summary sheet ' + sheet);
        }
        continue;
      }
      const code = item.processCode;
      assert.equal(item.fileName, PROCESS_FILE_PREFIXES[code] + '_11-2026.xlsx');
      const visible = wb.worksheets.filter(sh => sh.state !== 'hidden' && sh.state !== 'veryHidden').map(sh => sh.name);
      const expected = code === 'GC'
        ? [WORKBOOK1_FORMS.GC.sheet, 'TAY MÁY CẮT LỒNG']
        : [WORKBOOK1_FORMS[code]?.sheet || PROCESS_SHEETS[code].sheet];
      assert.deepEqual(visible, expected, code + ' visible template sheets');
      const sync = wb.getWorksheet('_KTC_SYNC');
      assert.ok(sync, code + ' sync sheet missing');
      assert.equal(sync.state, 'veryHidden', code + ' sync sheet must not be visible');
      const metadata = JSON.parse(String(sync.getCell('A1').value));
      assert.equal(String(metadata.version), String(EXCEL_CONTRACT_VERSION));
      assert.equal(metadata.yearMonth, MONTH);
      assert.equal(metadata.processCode, code);
      assert.equal(metadata.sheetName, WORKBOOK1_FORMS[code]?.sheet || PROCESS_SHEETS[code].sheet);
      assert.ok(Array.isArray(metadata.columns));
      assert.equal(Number(sync.getCell('A3').value), payload.processes[code].reports[0].id);
      assert.equal(String(sync.getCell('B3').value), '2026-11-10T10:00:00.000Z');
      assert.ok(JSON.parse(String(sync.getCell('D3').value)), code + ' original snapshot JSON');
    }
    assert.equal(names.size, 11);
  } finally {
    await fs.rm(directory, {recursive: true, force: true});
  }
});

test('generic CVK workbook is readable as a managed Excel sync source without contacting DB', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-phase2-sync-'));
  try {
    const { buildProcessWorkbookLocal } = require('../electron/monthlyWorkbookLocal.cjs');
    const output = await buildProcessWorkbookLocal({
      date: DATE, processCode:'CVK',
      payload:{
        yearMonth:MONTH, dataSource:'tidb.production_reports.approved',
        processes:{CVK:{reports:[fixture('CVK',11)],deductionTypes:[],defectTypes:[]}},
      },
    });
    const filepath=path.join(directory, 'synthetic-cvk.xlsx');
    await fs.writeFile(filepath,output.buffer, {flag:'wx'});
    const result=await readExcelChanges(filepath);
    assert.equal(result.managed,true);
    assert.ok(Array.isArray(result.changes));

    // A real Excel edit must generate a precise, concurrency-token-bound
    // patch without calling any backend API or mutating the original fixture.
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filepath);
    const meta = JSON.parse(String(workbook.getWorksheet('_KTC_SYNC').getCell('A1').value));
    const idCol = meta.columns.find(item => item.key === 'id');
    const okCol = meta.columns.find(item => item.key === 'ok');
    assert.ok(idCol && okCol, 'generic CVK must have sync ID and OK columns');
    const sheet = workbook.getWorksheet(meta.sheetName);
    let targetRow = null;
    for (let row = 6; row <= sheet.rowCount; row += 1) {
      if (Number(sheet.getCell(row, idCol.index).value) === 24011) { targetRow = row; break; }
    }
    assert.ok(targetRow, 'synthetic report row is still associated with its database ID');
    sheet.getCell(targetRow, okCol.index).value = 91;
    await workbook.xlsx.writeFile(filepath);
    const changed = await readExcelChanges(filepath);
    assert.equal(changed.managed, true);
    const edited = changed.changes.find(change => change.id === 24011);
    assert.ok(edited, 'modified Excel row must become an update proposal');
    assert.equal(edited.patch.tt_ok, 91);
    assert.equal(String(edited.expected_updated_at), '2026-11-10T10:00:00.000Z');
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test('all six approved Workbook1 paper sheets import a cell edit by hidden report identity without adding a visible ID column', async (t) => {
  for (const [index, [code, form]] of Object.entries(WORKBOOK1_FORMS).entries()) {
    await t.test(code, async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-paper-sync-'));
      try {
        const { buildProcessWorkbookLocal } = require('../electron/monthlyWorkbookLocal.cjs');
        const report = fixture(code, 50 + index);
        const output = await buildProcessWorkbookLocal({
          date: DATE, processCode: code,
          payload: {
            yearMonth: MONTH, dataSource: 'tidb.production_reports.approved',
            processes: { [code]: { reports: [report], deductionTypes: [], defectTypes: [] } },
          },
        });
        const filepath = path.join(directory, 'paper.xlsx');
        await fs.writeFile(filepath, output.buffer, { flag: 'wx' });
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filepath);
        const sync = workbook.getWorksheet('_KTC_SYNC');
        const metadata = JSON.parse(String(sync.getCell('A1').value));
        assert.equal(metadata.sheetName, form.sheet);
        assert.equal(metadata.rowIdentityMode, 'KTC_SYNC_ROW_V1');
        assert.equal(Number(sync.getCell('E3').value), form.first);
        assert.equal(String(sync.getCell('F3').value), report.worker_code);
        assert.ok(!metadata.columns.some(column => column.key === 'id'), code + ' paper sheet must remain unchanged');
        const sheet = workbook.getWorksheet(form.sheet);
        const actualTimeColumn = metadata.columns.find(column => column.key === 'actualTime');
        assert.ok(actualTimeColumn, 'editable actualTime column missing for ' + code);
        const unchanged = await readExcelChanges(filepath);
        assert.equal(unchanged.managed, true);
        assert.equal(unchanged.changes.filter(change => change.id === report.id).length, 0,
          code + ' unedited export must not send an update: ' + JSON.stringify(unchanged.changes));

        sheet.getCell(form.first, actualTimeColumn.index).value = 6.5;
        await workbook.xlsx.writeFile(filepath);
        const changed = await readExcelChanges(filepath);
        const updates = changed.changes.filter(change => change.id === report.id);
        assert.equal(updates.length, 1, code + ' should yield exactly one report update');
        assert.equal(updates[0].patch.actual_time, 6.5);
        assert.equal(updates[0].expected_updated_at, report.updated_at);
        assert.ok(!Object.hasOwn(updates[0].patch, 'tt_ok') || code !== 'EP',
          'do not clear OK when paper form has no mapped OK column');
      } finally {
        await fs.rm(directory, {recursive: true, force: true});
      }
    });
  }
});

test('paper row reorder or accidental worker-code overwrite fails closed rather than editing another approved report', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-paper-identity-'));
  try {
    const { buildProcessWorkbookLocal } = require('../electron/monthlyWorkbookLocal.cjs');
    const report = fixture('MAI', 70);
    const output = await buildProcessWorkbookLocal({
      date: DATE, processCode: 'MAI',
      payload: {
        yearMonth: MONTH, dataSource: 'tidb.production_reports.approved',
        processes: {MAI: {reports:[report], deductionTypes: [], defectTypes: []}},
      },
    });
    const filepath = path.join(directory, 'paper.xlsx');
    await fs.writeFile(filepath, output.buffer, {flag:'wx'});
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filepath);
    const config = JSON.parse(String(wb.getWorksheet('_KTC_SYNC').getCell('A1').value));
    const workerCodeColumn = config.columns.find(c => c.key === 'workerCode');
    assert.ok(workerCodeColumn);
    wb.getWorksheet(config.sheetName).getCell(config.firstDataRow, workerCodeColumn.index).value = 'DIFFERENT-EMPLOYEE';
    await wb.xlsx.writeFile(filepath);
    await assert.rejects(() => readExcelChanges(filepath),
      error => error?.code === 'EXCEL_SYNC_ROW_IDENTITY_MISMATCH');
  } finally {
    await fs.rm(directory, {recursive:true,force:true});
  }
});

test('older K1/K2 company paper layouts also preserve row-ID metadata and import only edited fields', async (t) => {
  const { FORMS } = require('../electron/originalProcessExcelTemplate.cjs');
  const { buildProcessWorkbookLocal } = require('../electron/monthlyWorkbookLocal.cjs');
  for (const [index, code] of ['K1', 'K2'].entries()) {
    await t.test(code, async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-legacy-paper-'));
      try {
        const report = fixture(code, 80 + index);
        const output = await buildProcessWorkbookLocal({
          date: DATE, processCode: code,
          payload: { yearMonth: MONTH, dataSource: 'tidb.production_reports.approved',
            processes: { [code]: { reports: [report], deductionTypes: [], defectTypes: [] } } },
        });
        const name = path.join(dir, code+'.xlsx');
        await fs.writeFile(name, output.buffer, {flag:'wx'});
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(name);
        const metaSheet = wb.getWorksheet('_KTC_SYNC');
        const config = JSON.parse(String(metaSheet.getCell('A1').value));
        assert.equal(config.sheetName, FORMS[code].sheet);
        assert.equal(config.rowIdentityMode, 'KTC_SYNC_ROW_V1');
        assert.equal(Number(metaSheet.getCell('E3').value), FORMS[code].first + 1);
        assert.ok(!config.columns.some(col => col.key === 'id'));
        const before = await readExcelChanges(name);
        assert.equal(before.changes.filter(c => c.id === report.id).length, 0, 'unedited '+code+' must not patch');
        const actualTime = config.columns.find(c => c.key === 'actualTime');
        assert.ok(actualTime);
        wb.getWorksheet(config.sheetName).getCell(config.firstDataRow, actualTime.index).value = 6.25;
        await wb.xlsx.writeFile(name);
        const after = await readExcelChanges(name);
        const update = after.changes.find(c => c.id === report.id);
        assert.ok(update, code+' changed row must map back to the original ID');
        assert.equal(update.patch.actual_time, 6.25);
        assert.equal(update.expected_updated_at, report.updated_at);
      } finally {
        await fs.rm(dir, {recursive:true,force:true});
      }
    });
  }
});

test('two dates in Workbook1 use distinct hidden source rows and never mix report IDs', async () => {
  const { buildProcessWorkbookLocal } = require('../electron/monthlyWorkbookLocal.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-multi-day-'));
  try {
    const older = fixture('DO', 95);
    const newer = {...fixture('DO', 96), work_date: '2026-11-11', entry_date: '2026-11-11'};
    const output = await buildProcessWorkbookLocal({
      date: DATE, processCode:'DO',
      payload: {yearMonth:MONTH, dataSource:'tidb.production_reports.approved',
        processes:{DO:{reports:[newer,older], deductionTypes:[],defectTypes:[]}}},
    });
    const filepath=path.join(dir,'two-days.xlsx');
    await fs.writeFile(filepath,output.buffer,{flag:'wx'});
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.readFile(filepath);
    const sync=wb.getWorksheet('_KTC_SYNC');
    const byId=new Map();
    for (let row=3;row<=sync.rowCount;row++) byId.set(Number(sync.getCell(row,1).value),Number(sync.getCell(row,5).value));
    assert.equal(byId.get(older.id), 3);
    assert.equal(byId.get(newer.id), 5);
    const config=JSON.parse(String(sync.getCell('A1').value));
    const actualTime=config.columns.find(c=>c.key==='actualTime');
    wb.getWorksheet(config.sheetName).getCell(5,actualTime.index).value=6.75;
    await wb.xlsx.writeFile(filepath);
    const edited=await readExcelChanges(filepath);
    assert.equal(edited.changes.filter(c=>c.id===older.id).length,0);
    const changed=edited.changes.filter(c=>c.id===newer.id);
    assert.equal(changed.length,1);
    assert.equal(changed[0].patch.actual_time,6.75);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});

test('duplicate report ID in veryHidden _KTC_SYNC fails closed before import', async () => {
  const { buildProcessWorkbookLocal } = require('../electron/monthlyWorkbookLocal.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-phase4-duplicate-meta-'));
  try {
    const report = fixture('DO', 119);
    const output = await buildProcessWorkbookLocal({
      date: DATE, processCode: 'DO',
      payload: { yearMonth: MONTH, dataSource: 'tidb.production_reports.approved',
        processes: { DO: { reports: [report], deductionTypes: [], defectTypes: [] } } }
    });
    const file = path.join(dir, 'duplicate-hidden-id.xlsx');
    await fs.writeFile(file, output.buffer, { flag: 'wx' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const sync = wb.getWorksheet('_KTC_SYNC');
    assert.ok(sync, 'source lineage exists');
    for (let column = 1; column <= 8; column++) {
      sync.getCell(4, column).value = sync.getCell(3, column).value;
    }
    await wb.xlsx.writeFile(file);
    await assert.rejects(() => readExcelChanges(file),
      error => error?.code === 'EXCEL_SYNC_DUPLICATE_META_ID');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
