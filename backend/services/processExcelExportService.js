const path = require('node:path');
const fs = require('node:fs/promises');
const db = require('../config/db');
const { buildMonthlyTemplateWorkbook } = require('./consolidatedExcelExportService');

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

async function listProcessesForMonth(value) {
  const yearMonth = normalizeYearMonth(value);
  const { start, next } = monthRange(yearMonth);
  return query(
    `SELECT p.id, p.process_code, p.process_name, COUNT(pr.id) AS report_count
       FROM processes p
       INNER JOIN production_reports pr
         ON pr.process_id = p.id
        AND pr.status = 'approved'
        AND pr.work_date >= ?
        AND pr.work_date < ?
      GROUP BY p.id, p.process_code, p.process_name
      HAVING COUNT(pr.id) > 0
      ORDER BY p.id`,
    [start, next]
  );
}

async function loadProcessMonthReports(value, processId) {
  const yearMonth = normalizeYearMonth(value);
  const { start, next } = monthRange(yearMonth);
  const reports = await query(
    `SELECT pr.*, w.worker_code, w.training_percent, w.position, w.department,
            u.full_name, p.process_name, p.process_code
       FROM production_reports pr
       INNER JOIN workers w ON w.id = pr.worker_id
       INNER JOIN users u ON u.id = w.user_id
       INNER JOIN processes p ON p.id = pr.process_id
      WHERE pr.status = 'approved'
        AND pr.work_date >= ?
        AND pr.work_date < ?
        AND pr.process_id = ?
      ORDER BY pr.work_date, w.worker_code, pr.machine_no, pr.created_at, pr.id`,
    [start, next, Number(processId)]
  );

  const reportIds = reports.map((report) => Number(report.id));
  if (!reportIds.length) return reports;
  const placeholders = reportIds.map(() => '?').join(',');
  const [deductionRows, defectRows] = await Promise.all([
    query(
      `SELECT prd.report_id, dt.id AS deduction_type_id, dt.deduction_code,
              dt.deduction_name, prd.hours
         FROM production_report_deductions prd
         INNER JOIN deduction_types dt ON dt.id = prd.deduction_type_id
        WHERE prd.report_id IN (${placeholders})
        ORDER BY prd.report_id, dt.sort_order, dt.id`,
      reportIds
    ),
    query(
      `SELECT prd.report_id, dt.id AS defect_type_id, dt.defect_code,
              dt.defect_name, prd.quantity
         FROM production_report_defects prd
         INNER JOIN defect_types dt ON dt.id = prd.defect_type_id
        WHERE prd.report_id IN (${placeholders})
        ORDER BY prd.report_id, dt.sort_order, dt.id`,
      reportIds
    )
  ]);

  const deductions = mapDetails(deductionRows, reportIds, (row) => ({
    deduction_type_id: Number(row.deduction_type_id),
    deduction_code: row.deduction_code || '',
    deduction_name: row.deduction_name || '',
    hours: Number(row.hours) || 0
  }));
  const defects = mapDetails(defectRows, reportIds, (row) => ({
    defect_type_id: Number(row.defect_type_id),
    defect_code: row.defect_code || '',
    defect_name: row.defect_name || '',
    quantity: Number(row.quantity) || 0
  }));

  reports.forEach((report) => {
    const id = Number(report.id);
    report.deductions = deductions.get(id) || [];
    report.defects = defects.get(id) || [];
  });
  return reports;
}

async function buildProcessWorkbook(value, processId) {
  const yearMonth = normalizeYearMonth(value);
  const reports = await loadProcessMonthReports(yearMonth, processId);
  if (!reports.length) {
    const error = new Error('Công đoạn không có báo cáo đã duyệt trong tháng');
    error.statusCode = 404;
    throw error;
  }

  const processName = reports[0].process_name || `Cong doan ${processId}`;
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

  const originalRoot = process.env.EXCEL_EXPORT_ROOT;
  const originalStage = process.env.EXCEL_STAGE_FOLDER_NAME;
  process.env.EXCEL_EXPORT_ROOT = tempRoot;
  process.env.EXCEL_STAGE_FOLDER_NAME = path.join(processFolder, month);

  try {
    const result = await buildMonthlyTemplateWorkbook(reports, yearMonth, { latestUpdatedAt });
    const desiredName = `Bao-cao-${slugName(processName)}-${month}-${year}.xlsx`;
    const desiredPath = path.join(folder, desiredName);
    if (result.archivePath !== desiredPath) {
      await fs.rm(desiredPath, { force: true });
      await fs.rename(result.archivePath, desiredPath);
    }
    return {
      path: desiredPath,
      fileName: desiredName,
      processId: Number(processId),
      processName,
      reportCount: reports.length,
      yearMonth
    };
  } finally {
    if (originalRoot === undefined) delete process.env.EXCEL_EXPORT_ROOT;
    else process.env.EXCEL_EXPORT_ROOT = originalRoot;
    if (originalStage === undefined) delete process.env.EXCEL_STAGE_FOLDER_NAME;
    else process.env.EXCEL_STAGE_FOLDER_NAME = originalStage;
  }
}

module.exports = {
  listProcessesForMonth,
  loadProcessMonthReports,
  buildProcessWorkbook,
  normalizeYearMonth
};
