const db = require('../config/db');
const { getActorProcessScope } = require('./processAuthorizationService');
const { assertReportVolume, chunkArray } = require('./excelExportGuards');
const { hasColumn } = require('./schemaCompatibilityService');
const { calculateReportPerformance } = require('./machinePerformanceService');
const { assertTrainingSnapshotAvailable } = require('./trainingSnapshotService');
const { mergeDefects } = require('../utils/reportDetailNormalizer');

const PROCESS_CODES = ['CAN','EP','XLBV','GC','MAI','DO','K1','K2','SX3'];
const query = (sql, params = []) => db.promise().query(sql, params).then(([rows]) => rows);

function monthRange(yearMonth) {
  const [year, month] = String(yearMonth).split('-').map(Number);
  const start = `${yearMonth}-01`;
  const nextDate = new Date(year, month, 1);
  const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`;
  return { start, next };
}

function mapDetails(rows, reportIds, mapper) {
  const result = new Map(reportIds.map((id) => [Number(id), []]));
  for (const row of rows) {
    const id = Number(row.report_id);
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(mapper(row));
  }
  return result;
}

async function loadBulkCompanyReports(yearMonth, actor) {
  const { start, next } = monthRange(yearMonth);
  const placeholders = PROCESS_CODES.map(() => '?').join(',');
  const allProcesses = await query(
    `SELECT id, process_code, process_name FROM processes WHERE UPPER(process_code) IN (${placeholders}) ORDER BY id`,
    PROCESS_CODES
  );
  const scope = actor ? await getActorProcessScope(actor) : { type: 'ALL', processIds: null };
  const processes = scope.type === 'ALL' ? allProcesses : allProcesses.filter((row) => scope.processIds.has(Number(row.id)));
  const processIds = processes.map((row) => Number(row.id));
  if (processIds.length) await assertReportVolume({ yearMonth, processIds });

  const processData = Object.fromEntries(PROCESS_CODES.map((code) => [code, {
    processId: null, processCode: code, processName: code, reports: [], physicalMachineEvents: [],
    deductionTypes: [], defectTypes: [], formulaSettingsByDate: {}
  }]));
  if (!processIds.length) return { processData, processIds, scope };

  const processPlaceholders = processIds.map(() => '?').join(',');
  const [supportsEntryDate, supportsExtraData] = await Promise.all([
    hasColumn('production_reports', 'entry_date'), hasColumn('production_reports', 'extra_data')
  ]);
  const entryDateSelect = supportsEntryDate ? 'COALESCE(pr.entry_date, DATE(pr.created_at), pr.work_date) AS entry_date' : 'COALESCE(DATE(pr.created_at), pr.work_date) AS entry_date';
  const extraDataSelect = supportsExtraData ? 'pr.extra_data AS extra_data' : 'NULL AS extra_data';

  const reports = await query(
    `SELECT pr.id, pr.source_temp_id, pr.worker_id, pr.process_id, pr.work_date, ${entryDateSelect}, pr.shift, pr.operation_type,
        pr.operation_mode, pr.machine_no, pr.product_name, pr.total_time, pr.actual_time, pr.deduction_time,
        pr.standard_output, pr.actual_output, pr.tt_ok, pr.tt_ng, pr.kqd_dap_lai, pr.kqd_tuot, pr.vo_do_long,
        pr.xuoc_do_long, pr.cong_gay, pr.xoay, pr.khong_dut, pr.bavia_hut, pr.ppcm, pr.loi_cao_su,
        pr.ng_kich_thuoc, pr.cat_lem, pr.note, ${extraDataSelect}, pr.status, pr.review_note, pr.reviewed_by,
        pr.approved_at, pr.created_at, pr.updated_at, w.worker_code, w.training_percent AS worker_training_percent,
        pr.training_percent_snapshot, COALESCE(pr.training_percent_snapshot, w.training_percent, 100) AS training_percent,
        w.position, w.department, u.full_name, p.process_name, p.process_code, pr.exclude_kqd_from_tt_snapshot,
        COALESCE(pr.exclude_kqd_from_tt_snapshot, 0) AS exclude_kqd_from_tt
       FROM production_reports pr
       INNER JOIN workers w ON w.id = pr.worker_id
       INNER JOIN users u ON u.id = w.user_id
       INNER JOIN processes p ON p.id = pr.process_id
      WHERE LOWER(TRIM(COALESCE(pr.status, ''))) = 'approved' AND pr.work_date >= ? AND pr.work_date < ?
        AND pr.process_id IN (${processPlaceholders})
      ORDER BY pr.work_date, w.worker_code, pr.machine_no, pr.created_at, pr.id`,
    [start, next, ...processIds]
  );

  for (const report of reports) {
    const hasTrainingSnapshot = report.training_percent_snapshot !== null && report.training_percent_snapshot !== undefined && String(report.training_percent_snapshot).trim() !== '';
    if (!hasTrainingSnapshot) {
      report.training_percent = Number.isFinite(Number(report.worker_training_percent)) ? Number(report.worker_training_percent) : 100;
      report.trainingSnapshotSource = report.worker_training_percent !== null && report.worker_training_percent !== undefined ? 'LEGACY_WORKER_MASTER' : 'LEGACY_DEFAULT_100';
      delete report.training_percent_snapshot;
    } else {
      assertTrainingSnapshotAvailable(report);
      report.trainingSnapshotSource = 'IMMUTABLE_SNAPSHOT';
    }
    const isMachineReport = String(report.operation_mode || '').toUpperCase() === 'MACHINE';
    if (!isMachineReport && (report.exclude_kqd_from_tt === null || report.exclude_kqd_from_tt === undefined)) {
      report.exclude_kqd_from_tt = 0;
      report.excludeKqdSnapshotSource = 'LEGACY_DEFAULT_0';
    }
  }

  const reportIds = reports.map((report) => Number(report.id));

  // These reads are independent. Running them together avoids serial TiDB
  // round trips in the Cloudflare Worker without changing their semantics.
  const [physicalMachineEvents, typeRows] = await Promise.all([
    query(`SELECT e.id,e.process_id,e.machine_id,e.machine_code,e.product_code,e.work_date,e.shift,e.physical_ok_quantity,e.physical_ng_quantity,
      e.physical_counted_output,e.physical_total_output,e.machine_time_hours,e.maximum_output,e.standard_output,e.standard_version_id,
      e.machine_standard_id,e.exclude_kqd_from_tt_snapshot,e.status FROM machine_production_events e WHERE e.status='approved'
      AND e.process_id IN (${processPlaceholders}) AND e.work_date>=? AND e.work_date<? ORDER BY e.work_date,e.shift,e.machine_code,e.id LIMIT 10000`,
      [...processIds, start, next]),
    query(`
      SELECT 'deduction' AS detail_type, id, process_id,
             deduction_code AS code, deduction_name AS name,
             deduction_code, deduction_name, sort_order,
             NULL AS defect_type_id, NULL AS quantity, id AS deduction_type_id
        FROM deduction_types
       WHERE process_id IN (${processPlaceholders}) AND status='active'
      UNION ALL
      SELECT 'defect' AS detail_type, id, process_id,
             defect_code AS code, defect_name AS name, defect_code, defect_name, sort_order,
             id AS defect_type_id, NULL AS quantity, NULL AS deduction_type_id
        FROM defect_types
       WHERE process_id IN (${processPlaceholders}) AND status='active'
      ORDER BY process_id, detail_type, sort_order, id`,
      [...processIds, ...processIds])
  ]);

  const deductionTypes = typeRows.filter((row) => row.detail_type === 'deduction');
  const defectTypes = typeRows.filter((row) => row.detail_type === 'defect');

  const detailBatchSize = Number(process.env.EXCEL_DETAIL_BATCH_SIZE || 1000);
  const detailBatches = chunkArray(reportIds, detailBatchSize);

  // Each report-id batch is independent. Load all batches concurrently so a
  // 1,942-report month does not spend the request lifetime waiting for one
  // batch after another. The result is flattened in original batch order.
  const batchResults = await Promise.all(detailBatches.map(async (ids) => {
    const p = ids.map(() => '?').join(',');
    const [detailRows, machineLineRows] = await Promise.all([
      query(`
        SELECT 'deduction' AS detail_type,
               prd.report_id, prd.deduction_type_id AS type_id,
               dt.deduction_code, dt.deduction_name,
               prd.hours AS value_hours, NULL AS value_quantity,
               COALESCE(dt.sort_order,999999) AS sort_order
          FROM production_report_deductions prd
          LEFT JOIN deduction_types dt ON dt.id=prd.deduction_type_id
         WHERE prd.report_id IN (${p})
        UNION ALL
        SELECT 'defect' AS detail_type,
               prd.report_id, prd.defect_type_id AS type_id,
               dt.defect_code, dt.defect_name,
               NULL AS value_hours, prd.quantity AS value_quantity,
               COALESCE(dt.sort_order,999999) AS sort_order
          FROM production_report_defects prd
          LEFT JOIN defect_types dt ON dt.id=prd.defect_type_id
         WHERE prd.report_id IN (${p})
        ORDER BY report_id, detail_type, sort_order, type_id`,
        [...ids, ...ids]),
      query(`SELECT * FROM production_report_machine_lines WHERE report_id IN (${p}) ORDER BY report_id,sort_order,id`, ids)
    ]);
    return { detailRows, machineLineRows };
  }));

  const deductionRows = [];
  const defectRows = [];
  const machineLineRows = [];
  for (const batch of batchResults) {
    for (const row of batch.detailRows) {
      if (row.detail_type === 'deduction') deductionRows.push(row);
      else defectRows.push(row);
    }
    machineLineRows.push(...batch.machineLineRows);
  }

  const deductions = mapDetails(deductionRows, reportIds, (row) => ({
    id: Number(row.type_id), deduction_type_id: Number(row.type_id), code: row.deduction_code || '',
    name: row.deduction_name || '', deduction_code: row.deduction_code || '', deduction_name: row.deduction_name || '', hours: Number(row.value_hours) || 0
  }));
  const defects = mapDetails(defectRows, reportIds, (row) => ({
    defect_type_id: Number(row.type_id), defect_code: row.defect_code || '', defect_name: row.defect_name || '', quantity: Number(row.value_quantity) || 0
  }));
  const machineLines = mapDetails(machineLineRows, reportIds, (row) => ({ ...row }));

  for (const report of reports) {
    const id = Number(report.id);
    report.deductions = deductions.get(id) || [];
    report.machineLines = machineLines.get(id) || [];

    const persistedDefects = defects.get(id) || [];
    report.defects = persistedDefects.length > 0
      ? mergeDefects(report, persistedDefects, report.machineLines)
      : mergeDefects(report, [], report.machineLines);
    report.excelDefectsSource = persistedDefects.length > 0
      ? 'production_report_defects'
      : (report.defects.length > 0 ? 'canonical_legacy_fallback' : 'none');

    const detailNg = report.defects.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
    const totalNg = Math.max(0, Number(report.tt_ng) || 0);
    report.excelDetailNg = detailNg;
    report.excelUnclassifiedNg = Math.max(0, totalNg - detailNg);
    report.excelDefectsComplete = report.excelUnclassifiedNg === 0;

    const calculated = calculateReportPerformance({ report, machineLines: report.machineLines }) || {};
    for (const [key, value] of Object.entries(calculated)) {
      if (report[key] === undefined || report[key] === null || report[key] === '') report[key] = value;
    }
    report.dataSource = 'production_reports';
    report.isApprovedDatabaseRecord = true;
  }

  const typeByProcess = new Map(processIds.map((id) => [Number(id), { deductions: [], defects: [] }]));
  for (const row of deductionTypes) typeByProcess.get(Number(row.process_id))?.deductions.push(row);
  for (const row of defectTypes) typeByProcess.get(Number(row.process_id))?.defects.push(row);
  const eventByProcess = new Map(processIds.map((id) => [Number(id), []]));
  for (const row of physicalMachineEvents) eventByProcess.get(Number(row.process_id))?.push(row);
  const reportsByProcess = new Map(processIds.map((id) => [Number(id), []]));
  for (const report of reports) reportsByProcess.get(Number(report.process_id))?.push(report);

  for (const process of processes) {
    const code = String(process.process_code || '').toUpperCase();
    const list = reportsByProcess.get(Number(process.id)) || [];
    processData[code] = {
      processId: Number(process.id), processCode: code, processName: process.process_name, reports: list,
      physicalMachineEvents: eventByProcess.get(Number(process.id)) || [],
      deductionTypes: typeByProcess.get(Number(process.id))?.deductions || [],
      defectTypes: typeByProcess.get(Number(process.id))?.defects || [], formulaSettingsByDate: {}
    };
  }
  return { processData, processIds, scope };
}

module.exports = { loadBulkCompanyReports, PROCESS_CODES };
