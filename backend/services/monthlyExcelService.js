const db = require("../config/db");
const { calculateReportPerformance } = require("./machinePerformanceService");
const { buildCommonProcessMonthlyWorkbook } = require("./commonProcessMonthlyExcelService");
const { getMonthlyTarget } = require("./consolidatedExcelExportService");

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

const buildGiaCongMachineAccounting = (report, machineLines, eventMap) => {
    const seenEvents = new Set();
    let grossHours = 0;
    let deductionHours = 0;
    const deductions = [];
    const seenDeductions = new Set();
    for (const [index, line] of (Array.isArray(machineLines) ? machineLines : []).entries()) {
        const eventId = Number(line.machine_event_id) || 0;
        const event = eventId ? eventMap.get(eventId) : null;
        if (event) {
            if (!seenEvents.has(eventId)) {
                seenEvents.add(eventId);
                grossHours += Math.max(0, Number(event.machine_time_hours) || 0);
            }
        } else if (!eventId) {
            grossHours += Math.max(0, Number(line.excel_machine_time_hours ?? line.machine_time_hours) || 0);
        }
        let lineDeductions = [];
        try {
            const parsed = typeof line.deductions_json === 'string' ? JSON.parse(line.deductions_json) : line.deductions_json;
            lineDeductions = Array.isArray(parsed) ? parsed : [];
        } catch (_error) {}
        const detailDeductionHours = lineDeductions.reduce((sum, item) => sum + Math.max(0, Number(item?.hours) || 0), 0);
        const lineDeductionHours = Math.max(
            0,
            Number(line.deduction_time_hours) || 0,
            (Number(line.adjustment_minutes) || 0) / 60,
            detailDeductionHours
        );
        const key = eventId ? 'EVENT:' + eventId : 'LINE:' + (Number(line.id) || index);
        if (!seenDeductions.has(key)) {
            seenDeductions.add(key);
            deductionHours += lineDeductionHours;
            for (const item of lineDeductions) {
                const hours = Math.max(0, Number(item?.hours) || 0);
                if (!hours) continue;
                const existing = deductions.find((entry) => String(entry.deduction_type_id || entry.deduction_type_code || entry.deduction_name) === String(Number(item?.deduction_type_id) || item?.deduction_code || item?.deduction_name || ''));
                if (existing) existing.hours += hours;
                else deductions.push({
                    deduction_type_id: Number(item?.deduction_type_id) || undefined,
                    deduction_type_code: String(item?.deduction_code || '').trim(),
                    deduction_name: String(item?.deduction_name || '').trim(),
                    hours
                });
            }
        }
    }
    const hasMachineLines = Array.isArray(machineLines) && machineLines.length > 0;
    const source = seenEvents.size ? 'MACHINE_EVENT' : (hasMachineLines ? 'MACHINE_LINE' : 'MACHINE_DATA_MISSING');
    return { source, grossHours, deductionHours, netHours: Math.max(0, grossHours - deductionHours), deductions };
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
            p.process_code,
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

    // Historical approved reports may predate the KQD policy snapshot columns.
    // Excel export must remain available for those records; only the edit/save
    // workflow requires an immutable policy snapshot. Treat a missing snapshot
    // as "not excluded from TT" for export calculation compatibility.
    for (const report of reports) {
        if (
            report.exclude_kqd_from_tt_snapshot === null ||
            report.exclude_kqd_from_tt_snapshot === undefined ||
            String(report.exclude_kqd_from_tt_snapshot).trim() === ''
        ) {
            report.exclude_kqd_from_tt_snapshot = 0;
            report.exclude_kqd_from_tt = 0;
        }
    }

    const reportIds = reports.map((report) => Number(report.id));
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
    const machineEventIds = [...new Set(machineLineRows.map((row) => Number(row.machine_event_id)).filter(Boolean))];
    let machineEventRows = [];
    if (machineEventIds.length) {
        const eventPlaceholders = machineEventIds.map(() => '?').join(',');
        machineEventRows = await query(
            `SELECT id,machine_time_hours FROM machine_production_events WHERE id IN (${eventPlaceholders})`,
            machineEventIds
        );
    }
    const machineEventMap = new Map(machineEventRows.map((row) => [Number(row.id), row]));
    reports.forEach((report) => {
        const id = Number(report.id);
        report.deductions = deductions.get(id) || [];
        report.defects = defects.get(id) || [];
        const lines = (machineLines.get(id) || []).map((line) => {
            const event = machineEventMap.get(Number(line.machine_event_id));
            return {
                ...line,
                excel_machine_time_hours: Number(line.machine_event_id)
                    ? (event ? Math.max(0, Number(event.machine_time_hours) || 0) : 0)
                    : Math.max(0, Number(line.machine_time_hours) || 0)
            };
        });
        report.machineLines = lines;
        Object.assign(report, calculateReportPerformance({ report, machineLines: lines }));
        if (String(report.process_code || '').toUpperCase() === 'GC' && String(report.operation_mode || '').toUpperCase() === 'MACHINE') {
            report.machineAccounting = buildGiaCongMachineAccounting(report, lines, machineEventMap);
            report.deductions = report.machineAccounting.deductions;
        }
    });
    reports.deductionTypes = deductionTypes;
    reports.defectTypes = defectTypes;
    return reports;
};

const buildMonthlyWorkbookInternal = async (yearMonth) => {
    const reports = await loadMonthReports(yearMonth);
    const result = await buildCommonProcessMonthlyWorkbook(reports, yearMonth, {
        deductionTypes: reports.deductionTypes || [],
        defectTypes: reports.defectTypes || []
    });

    if (process.env.KTC_DEBUG_EXPORTS === "true") console.log("[KTC] Monthly Excel updated", { archivePath: result.archivePath, layout: result.layout });
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
    const queue = require('./excelExportJobQueue');
    return queue.enqueueMonthlyDates(dates, requestedBy);
};

const getMonthlyFile = (dateOrMonth) => {
    const yearMonth = normalizeYearMonth(dateOrMonth);
    return getMonthlyTarget(yearMonth, { stageFolder: 'BC công đoạn' });
};

module.exports = {
    buildMonthlyWorkbook,
    scheduleMonthlyRebuild,
    getMonthlyFile,
    loadMonthReports
};
