const path = require('node:path');
const fs = require('node:fs/promises');
const db = require('../config/db');
const { getActorProcessScope, assertProcessScope, scopeSql } = require('./processAuthorizationService');
const { assertReportVolume, chunkArray } = require('./excelExportGuards');
const { hasColumn } = require('./schemaCompatibilityService');
const { calculateReportPerformance } = require('./machinePerformanceService');
const { assertTrainingSnapshotAvailable } = require('./trainingSnapshotService');

const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

const normalizeYearMonth = (value) => {
  const yearMonth = String(value || '').slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    throw new Error('Tháng xuất Excel không hợp lệ');
  }
  return yearMonth;
};

const monthRange = (yearMonth) => {
  const [year, month] = yearMonth.split('-').map(Number);
  const start = `${yearMonth}-01`;
  const nextDate = new Date(year, month, 1);
  const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`;
  return { start, next };
};

const safeName = (value, fallback = 'Cong doan') => String(value || fallback)
  .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
  .replace(/\s+/g, ' ')
  .trim() || fallback;

const slugName = (value) => safeName(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'cong-doan';

const mapDetails = (rows, reportIds, mapper) => {
  const result = new Map(reportIds.map((id) => [Number(id), []]));
  rows.forEach((row) => {
    const id = Number(row.report_id);
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(mapper(row));
  });
  return result;
};

async function listProcessesForMonth(value, options = {}) {
  const yearMonth = normalizeYearMonth(value);
  const { start, next } = monthRange(yearMonth);
  const scope = options.actor ? await getActorProcessScope(options.actor) : { type:'ALL', processIds:null };
  const scoped = scopeSql(scope, 'p.id', [start, next]);
  const rows = await query(
    `SELECT p.id, p.process_code, p.process_name, COUNT(pr.id) AS report_count
       FROM processes p
       LEFT JOIN production_reports pr
         ON pr.process_id = p.id
        AND LOWER(TRIM(COALESCE(pr.status, ''))) = 'approved'
        AND pr.work_date >= ?
        AND pr.work_date < ?
      WHERE LOWER(COALESCE(p.status, 'active')) IN ('active', 'enabled', '1') ${scoped.clause}
      GROUP BY p.id, p.process_code, p.process_name
      ORDER BY CASE WHEN UPPER(p.process_code) = 'GC' THEN 0 ELSE 1 END, p.id`,
    scoped.params
  );

  // Danh sách này phục vụ file báo cáo theo công đoạn, vì vậy Mài và Đo
  // phải luôn là hai công đoạn độc lập. Việc gộp MAI + DO chỉ áp dụng cho
  // workbook công ty A+B và được xử lý ở companyExcelExportService.
  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    report_count: Number(row.report_count || 0)
  }));
}

async function loadProcessMonthReports(value, processId, options = {}) {
  if (options.actor) await assertProcessScope(options.actor, processId, { action:'PROCESS_EXPORT' });
  const yearMonth = normalizeYearMonth(value);
  const { start, next } = monthRange(yearMonth);
  // Dữ liệu Excel chỉ lấy từ báo cáo đã duyệt trong production_reports.
  // Các cột mở rộng là tùy chọn để tương thích schema TiDB cũ; nếu chưa có,
  // export trả NULL thay vì làm hỏng toàn bộ API.
  const [supportsEntryDate, supportsExtraData] = await Promise.all([
    hasColumn('production_reports', 'entry_date'),
    hasColumn('production_reports', 'extra_data')
  ]);
  const entryDateSelect = supportsEntryDate
    ? 'COALESCE(pr.entry_date, DATE(pr.created_at), pr.work_date) AS entry_date'
    : 'COALESCE(DATE(pr.created_at), pr.work_date) AS entry_date';
  const extraDataSelect = supportsExtraData
    ? 'pr.extra_data AS extra_data'
    : 'NULL AS extra_data';

  const reports = await query(
    `SELECT
        pr.id, pr.source_temp_id, pr.worker_id, pr.process_id,
        pr.work_date, ${entryDateSelect}, pr.shift, pr.operation_type,
        pr.operation_mode, pr.machine_no, pr.product_name,
        pr.total_time, pr.actual_time, pr.deduction_time,
        pr.standard_output, pr.actual_output, pr.tt_ok, pr.tt_ng,
        pr.note, ${extraDataSelect}, pr.status, pr.review_note,
        pr.reviewed_by, pr.approved_at, pr.created_at, pr.updated_at,
        w.worker_code, pr.training_percent_snapshot, pr.training_percent_snapshot AS training_percent, w.position, w.department,
        u.full_name, p.process_name, p.process_code,
        pr.exclude_kqd_from_tt_snapshot, pr.exclude_kqd_from_tt_snapshot AS exclude_kqd_from_tt
       FROM production_reports AS pr
       INNER JOIN workers AS w ON w.id = pr.worker_id
       INNER JOIN users AS u ON u.id = w.user_id
       INNER JOIN processes AS p ON p.id = pr.process_id
      WHERE LOWER(TRIM(COALESCE(pr.status, ''))) = 'approved'
        AND pr.work_date >= ?
        AND pr.work_date < ?
        AND pr.process_id = ?
      ORDER BY pr.work_date, w.worker_code, pr.machine_no, pr.created_at, pr.id`,
    [start, next, Number(processId)]
  );

  // F05: physical machine truth is exported once per approved production event.
  // Worker rows remain worker credited-output rows and must never be used as machine physical aggregation.
  reports.physicalMachineEvents = await query(
    `SELECT e.id,e.process_id,e.machine_id,e.machine_code,e.product_code,e.work_date,e.shift,
            e.physical_ok_quantity,e.physical_ng_quantity,e.physical_counted_output,e.physical_total_output,
            e.machine_time_hours,e.maximum_output,e.standard_output,e.standard_version_id,e.machine_standard_id,
            e.exclude_kqd_from_tt_snapshot,e.status
       FROM machine_production_events e
      WHERE e.status='approved' AND e.process_id=? AND e.work_date>=? AND e.work_date<?
      ORDER BY e.work_date,e.shift,e.machine_code,e.id`,
    [Number(processId), start, next]
  );

  for (const report of reports) {
    // Historical Excel must never re-read mutable master state.
    assertTrainingSnapshotAvailable(report);
    const isMachineReport = String(report.operation_mode || '').toUpperCase() === 'MACHINE';
    if (!isMachineReport && (report.exclude_kqd_from_tt === null || report.exclude_kqd_from_tt === undefined)) {
      const error = new Error('Báo cáo cũ chưa có snapshot chính sách KQD; cần audit trước khi xuất Excel lịch sử');
      error.status = 422; error.code = 'KQD_POLICY_SNAPSHOT_MISSING'; error.isPublic = true;
      throw error;
    }
  }

  const reportIds = reports.map((report) => Number(report.id));
  // Danh mục NG và trừ giờ là cấu hình của công đoạn, không phụ thuộc tháng
  // có phát sinh báo cáo hay không. Luôn tải danh mục trước để Excel có đủ
  // cột chi tiết ngay cả khi tháng hiện tại chưa có dòng dữ liệu.
  const [deductionTypes, defectTypes] = await Promise.all([
    query(`SELECT id, process_id, deduction_code AS code, deduction_name AS name, deduction_code, deduction_name, sort_order FROM deduction_types WHERE process_id=? AND status='active' ORDER BY sort_order,id`, [Number(processId)]),
    query(`SELECT id, process_id, defect_code AS code, defect_name AS name, defect_code, defect_name, sort_order FROM defect_types WHERE process_id=? AND status='active' ORDER BY sort_order,id`, [Number(processId)])
  ]);

  reports.deductionTypes = deductionTypes;
  reports.defectTypes = defectTypes;
  if (!reportIds.length) return reports;

  const deductionRows = [];
  const defectRows = [];
  const machineLineRows = [];
  for (const ids of chunkArray(reportIds, Number(process.env.EXCEL_DETAIL_BATCH_SIZE || 400))) {
    const placeholders = ids.map(() => '?').join(',');
    const [deductionsBatch, defectsBatch, machineBatch] = await Promise.all([
      query(`SELECT prd.report_id, prd.deduction_type_id, dt.deduction_code, dt.deduction_name, prd.hours FROM production_report_deductions prd LEFT JOIN deduction_types dt ON dt.id=prd.deduction_type_id WHERE prd.report_id IN (${placeholders}) ORDER BY prd.report_id,COALESCE(dt.sort_order,999999),prd.deduction_type_id`, ids),
      query(`SELECT prd.report_id, prd.defect_type_id, dt.defect_code, dt.defect_name, prd.quantity FROM production_report_defects prd LEFT JOIN defect_types dt ON dt.id=prd.defect_type_id WHERE prd.report_id IN (${placeholders}) ORDER BY prd.report_id,COALESCE(dt.sort_order,999999),prd.defect_type_id`, ids),
      query(`SELECT * FROM production_report_machine_lines WHERE report_id IN (${placeholders}) ORDER BY report_id,sort_order,id`, ids)
    ]);
    deductionRows.push(...deductionsBatch); defectRows.push(...defectsBatch); machineLineRows.push(...machineBatch);
  }
  const deductions = mapDetails(deductionRows, reportIds, (row) => ({
    id: Number(row.id ?? row.deduction_type_id),
    deduction_type_id: Number(row.deduction_type_id),
    code: row.code || row.deduction_code || '',
    name: row.name || row.deduction_name || '',
    deduction_code: row.code || row.deduction_code || '',
    deduction_name: row.name || row.deduction_name || '',
    hours: Number(row.hours) || 0
  }));
  const defects = mapDetails(defectRows, reportIds, (row) => ({
    defect_type_id: Number(row.defect_type_id),
    defect_code: row.defect_code || '',
    defect_name: row.defect_name || '',
    quantity: Number(row.quantity) || 0
  }));

  const machineLines = mapDetails(machineLineRows, reportIds, (row) => ({ ...row }));
  reports.forEach((report) => {
    const id = Number(report.id);
    // Chỉ gắn chi tiết đúng report_id. Không ghi đè các cột đã lưu trong
    // production_reports bằng kết quả tính lại ở thời điểm xuất Excel.
    report.deductions = deductions.get(id) || [];
    report.defects = defects.get(id) || [];
    report.machineLines = machineLines.get(id) || [];

    // Tính aggregate multi-machine từ chính snapshot từng máy đã lưu trong DB.
    // Không ghi đè các cột production_reports; chỉ bổ sung machinePerformance
    // để calculationSnapshot và Excel dùng đúng tổng counted/max của nhiều máy.
    Object.assign(report, calculateReportPerformance({
      report,
      machineLines: report.machineLines
    }));

    report.dataSource = 'production_reports';
    report.isApprovedDatabaseRecord = true;
  });
  reports.deductionTypes = deductionTypes;
  reports.defectTypes = defectTypes;
  return reports;
}

async function buildProcessWorkbook(value, processId) {
  const yearMonth = normalizeYearMonth(value);
  const processRows = await query(
    'SELECT id, process_code, process_name FROM processes WHERE id = ? LIMIT 1',
    [Number(processId)]
  );
  const selectedProcess = processRows[0];
  if (!selectedProcess) {
    const error = new Error('Không tìm thấy công đoạn cần xuất Excel');
    error.statusCode = 404;
    throw error;
  }

  // Báo cáo công đoạn luôn được dựng riêng. Không gọi service A+B Mài - Đo
  // từ luồng này vì sẽ làm trùng tên, sai thư mục và mất file Mài/Đo riêng.
  await assertReportVolume({ yearMonth, processIds: [Number(processId)] });
  const reports = await loadProcessMonthReports(yearMonth, processId);

  // Luôn tạo lại file tháng cho mọi công đoạn đang hoạt động. Nếu tháng chưa
  // có báo cáo đã duyệt, workbook vẫn được dựng từ template với bảng dữ liệu
  // rỗng. Điều này giúp Desktop luôn có đầy đủ Bao-cao-<công đoạn>-MM-YYYY
  // thay vì âm thầm bỏ qua cả công đoạn.
  const processName = reports[0]?.process_name || selectedProcess.process_name || `Cong doan ${processId}`;
  const latestUpdatedAt = reports.reduce((latest, report) => {
    const candidate = report.updated_at || report.approved_at || report.created_at;
    if (!candidate) return latest;
    const iso = new Date(candidate).toISOString();
    return !latest || iso > latest ? iso : latest;
  }, null);

  const tempRoot = process.env.EXCEL_PROCESS_TEMP_ROOT || path.join(process.cwd(), 'exports-process');
  const [year, month] = yearMonth.split('-');
  const processFolder = safeName(processName);
  const folder = path.join(tempRoot, year, processFolder, month);
  await fs.mkdir(folder, { recursive: true });

  // The process workbook now comes directly from the canonical KTC 9-process template.
  // All template sheets, merged cells and formatting remain intact; only the matching
  // process sheet receives approved DB rows.
  const { buildProcessTemplateWorkbook } = require('./excelTemplateContractService');
  const result = await buildProcessTemplateWorkbook(reports, yearMonth, {
    processCode: String(selectedProcess.process_code || '').toUpperCase(),
    processName,
    latestUpdatedAt,
    deductionTypes: reports.deductionTypes || [],
    defectTypes: reports.defectTypes || [],
    exportRoot: tempRoot,
    stageFolder: processFolder
  });

  return {
    path: result.archivePath,
    fileName: result.fileName,
    processId: Number(processId),
    processName,
    reportCount: reports.length,
    yearMonth,
    templateSheet: result.templateSheet,
    templateHeaderRow: result.headerRow
  };
}

module.exports = {
  listProcessesForMonth,
  loadProcessMonthReports,
  buildProcessWorkbook,
  normalizeYearMonth
};
