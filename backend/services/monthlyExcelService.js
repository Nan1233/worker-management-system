const db = require("../config/db");
const { calculateReportPerformance } = require("./machinePerformanceService");
const {
    buildMonthlyTemplateWorkbook,
    getMonthlyTarget
} = require("./consolidatedExcelExportService");

const query = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

const inFlightBuilds = new Map();

const normalizeYearMonth = (value) => {
    const yearMonth = String(value || "").slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
        throw new Error("Tháng xuất Excel không hợp lệ");
    }
    return yearMonth;
};

const monthRange = (yearMonth) => {
    const [year, month] = yearMonth.split("-").map(Number);
    const start = `${yearMonth}-01`;
    const nextDate = new Date(year, month, 1);
    const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-01`;
    return { start, next };
};

const mapDetails = (rows, reportIds, valueMapper) => {
    const result = new Map();
    reportIds.forEach((id) => result.set(Number(id), []));
    rows.forEach((row) => {
        const reportId = Number(row.report_id);
        if (!result.has(reportId)) result.set(reportId, []);
        result.get(reportId).push(valueMapper(row));
    });
    return result;
};

const loadMonthReports = async (yearMonth) => {
    const { start, next } = monthRange(yearMonth);
    const reports = await query(
        `SELECT
            pr.*,
            w.worker_code,
            pr.training_percent_snapshot AS training_percent,
            w.position,
            w.department,
            u.full_name,
            p.process_name,
            pr.exclude_kqd_from_tt_snapshot,
            pr.exclude_kqd_from_tt_snapshot AS exclude_kqd_from_tt
         FROM production_reports AS pr
         INNER JOIN workers AS w ON w.id = pr.worker_id
         INNER JOIN users AS u ON u.id = w.user_id
         LEFT JOIN processes AS p ON p.id = pr.process_id
         WHERE LOWER(TRIM(COALESCE(pr.status, ''))) = 'approved'
           AND pr.work_date >= ?
           AND pr.work_date < ?
         ORDER BY pr.work_date, w.worker_code, pr.machine_no, pr.created_at, pr.id`,
        [start, next]
    );

    for (const report of reports) {
        const isMachineReport = String(report.operation_mode || '').toUpperCase() === 'MACHINE';
        if (!isMachineReport && (report.exclude_kqd_from_tt_snapshot === null || report.exclude_kqd_from_tt_snapshot === undefined)) {
            const error = new Error('Báo cáo cũ chưa có snapshot chính sách KQD; cần audit trước khi xuất Excel lịch sử');
            error.status = 422;
            error.code = 'KQD_POLICY_SNAPSHOT_MISSING';
            error.isPublic = true;
            throw error;
        }
    }

    const reportIds = reports.map((report) => Number(report.id));
    // Lấy danh mục cho toàn bộ công đoạn đang hoạt động, không chỉ các công
    // đoạn có báo cáo trong tháng. Nhờ đó workbook luôn có cột NG/trừ giờ
    // đúng theo master data của từng công đoạn.
    const activeProcesses = await query(
        `SELECT id FROM processes WHERE LOWER(COALESCE(status, 'active')) IN ('active', 'enabled', '1') ORDER BY id`
    );
    const processIds = activeProcesses.map((row) => Number(row.id)).filter(Boolean);
    const processPlaceholders = processIds.map(() => '?').join(',');
    const [deductionTypes, defectTypes] = processIds.length
        ? await Promise.all([
            query(
                `SELECT id, process_id, deduction_code AS code, deduction_name AS name,
                        deduction_code, deduction_name, sort_order
                   FROM deduction_types
                  WHERE process_id IN (${processPlaceholders}) AND status = 'active'
                  ORDER BY process_id, sort_order, id`,
                processIds
            ),
            query(
                `SELECT id, process_id, defect_code AS code, defect_name AS name,
                        defect_code, defect_name, sort_order
                   FROM defect_types
                  WHERE process_id IN (${processPlaceholders}) AND status = 'active'
                  ORDER BY process_id, sort_order, id`,
                processIds
            )
        ])
        : [[], []];

    reports.deductionTypes = deductionTypes;
    reports.defectTypes = defectTypes;
    if (!reportIds.length) return reports;

    const placeholders = reportIds.map(() => "?").join(",");
    const [deductionRows, defectRows, machineLineRows] = await Promise.all([
        query(
            `SELECT prd.report_id, dt.id AS deduction_type_id,
                    dt.deduction_code, dt.deduction_name, prd.hours
             FROM production_report_deductions AS prd
             INNER JOIN deduction_types AS dt ON dt.id = prd.deduction_type_id
             WHERE prd.report_id IN (${placeholders})
             ORDER BY prd.report_id, dt.sort_order, dt.id`,
            reportIds
        ),
        query(
            `SELECT prd.report_id, dt.id AS defect_type_id,
                    dt.defect_code, dt.defect_name, prd.quantity
             FROM production_report_defects AS prd
             INNER JOIN defect_types AS dt ON dt.id = prd.defect_type_id
             WHERE prd.report_id IN (${placeholders})
               ORDER BY prd.report_id, dt.sort_order, dt.id`,
            reportIds
        ),
        query(`SELECT * FROM production_report_machine_lines WHERE report_id IN (${placeholders}) ORDER BY report_id, sort_order, id`, reportIds)
    ]);

    const deductions = mapDetails(deductionRows, reportIds, (row) => ({
        id: Number(row.id ?? row.deduction_type_id),
        deduction_type_id: Number(row.deduction_type_id),
        code: row.code || row.deduction_code || "",
        name: row.name || row.deduction_name || "",
        deduction_code: row.code || row.deduction_code || "",
        deduction_name: row.name || row.deduction_name || "",
        hours: Number(row.hours) || 0
    }));
    const defects = mapDetails(defectRows, reportIds, (row) => ({
        defect_type_id: Number(row.defect_type_id),
        defect_code: row.defect_code || "",
        defect_name: row.defect_name || "",
        quantity: Number(row.quantity) || 0
    }));

    const machineLines = mapDetails(machineLineRows, reportIds, (row) => row);
    reports.forEach((report) => {
        const id = Number(report.id);
        report.deductions = deductions.get(id) || [];
        report.defects = defects.get(id) || [];
        Object.assign(report, calculateReportPerformance({ report, machineLines: machineLines.get(id) || [] }));
    });
    reports.deductionTypes = deductionTypes;
    reports.defectTypes = defectTypes;
    return reports;
};

const buildMonthlyWorkbookInternal = async (yearMonth) => {
    const reports = await loadMonthReports(yearMonth);
    const latestUpdatedAt = reports.reduce((latest, report) => {
        const value = report.updated_at || report.approved_at || report.created_at;
        if (!value) return latest;
        const iso = new Date(value).toISOString();
        return !latest || iso > latest ? iso : latest;
    }, null);

    const result = await buildMonthlyTemplateWorkbook(reports, yearMonth, {
        latestUpdatedAt,
        deductionTypes: reports.deductionTypes || [],
        defectTypes: reports.defectTypes || []
    });

    console.log("MONTHLY EXCEL UPDATED:", result.archivePath);
    return {
        path: result.archivePath,
        fileName: result.fileName,
        reportCount: result.reportCount,
        url: null
    };
};

const buildMonthlyWorkbook = async (value) => {
    const yearMonth = normalizeYearMonth(value);
    if (inFlightBuilds.has(yearMonth)) return inFlightBuilds.get(yearMonth);

    const promise = buildMonthlyWorkbookInternal(yearMonth)
        .finally(() => inFlightBuilds.delete(yearMonth));
    inFlightBuilds.set(yearMonth, promise);
    return promise;
};

const scheduleMonthlyRebuild = (dates, requestedBy = null) => {
    // Không dựng Excel trong tiến trình web. Chỉ ghi job bền vững vào DB;
    // excelExportJobQueue sẽ chạy tuần tự trong worker thread và retry khi lỗi.
    const queue = require('./excelExportJobQueue');
    return queue.enqueueMonthlyDates(dates, requestedBy);
};

const getMonthlyFile = (dateOrMonth) => {
    const yearMonth = normalizeYearMonth(dateOrMonth);
    return getMonthlyTarget(yearMonth);
};

module.exports = {
    buildMonthlyWorkbook,
    scheduleMonthlyRebuild,
    getMonthlyFile,
    loadMonthReports
};
