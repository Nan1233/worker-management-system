const AuditService = require("../services/auditService");
const createModel = require("./productionTempCreateModel");
const { recalculateReportOutput } = require("../services/kqdReportCalculationService");
const { validateMachineLines } = require("../services/machineLineValidationService");
const { query, getConnection, beginTransaction, beginReadCommittedTransaction, commit, rollback, editableFields } = require("./productionTempModelShared");
const { validateMachineWorkerCapacityLocked } = require("../services/factoryMachineRuleService");

const { DAILY_HOURS_LIMIT, exceedsDailyHoursLimit } = require("../utils/dailyHoursLimit");
const WORKER_EDIT_WINDOW_MS = 10 * 60 * 1000;

const checkDailyHours = async (connection, { workerId, workDate, shift, incomingActualHours, incomingMachineLines = [], isGc = false, excludeTempReportId = null }) => {
    const worker = Number(workerId), date = String(workDate || "").slice(0, 10), shiftValue = String(shift || "").trim();
    if (!Number.isInteger(worker) || worker <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const tempExcludeSql = excludeTempReportId ? "AND pr.id <> ?" : "";
    const params = excludeTempReportId ? [worker, date, shiftValue, worker, date, shiftValue, excludeTempReportId] : [worker, date, shiftValue, worker, date, shiftValue];
    const rows = await query(connection, `
        SELECT COALESCE(SUM(counted_hours),0) AS counted_hours FROM (
            SELECT CASE WHEN p.process_code='GC' AND EXISTS (SELECT 1 FROM production_report_machine_lines ml WHERE ml.report_id=pr.id)
                THEN COALESCE((SELECT (COALESCE(SUM(CASE WHEN UPPER(REPLACE(REPLACE(REPLACE(TRIM(ml.machine_code),'-',''),' ',''),'_','')) IN ('5','C5','M5','MAY5','MÁY5','MACHINE5','GC5','G5','6','C6','M6','MAY6','MÁY6','MACHINE6','GC6','G6','7','C7','M7','MAY7','MÁY7','MACHINE7','GC7','G7','11','C11','M11','MAY11','MÁY11','MACHINE11','GC11','G11') THEN 0 ELSE GREATEST(0,COALESCE(ml.machine_time_hours,0)) END),0) + COALESCE(MAX(CASE WHEN UPPER(REPLACE(REPLACE(REPLACE(TRIM(ml.machine_code),'-',''),' ',''),'_','')) IN ('5','C5','M5','MAY5','MÁY5','MACHINE5','GC5','G5','6','C6','M6','MAY6','MÁY6','MACHINE6','GC6','G6','7','C7','M7','MAY7','MÁY7','MACHINE7','GC7','G7','11','C11','M11','MAY11','MÁY11','MACHINE11','GC11','G11') THEN GREATEST(0,COALESCE(ml.machine_time_hours,0)) ELSE 0 END),0)) FROM production_report_machine_lines ml WHERE ml.report_id=pr.id),0)
                ELSE COALESCE(pr.total_time, COALESCE(pr.actual_time,0) + COALESCE(pr.deduction_time,0)) END AS counted_hours
            FROM production_reports pr JOIN processes p ON p.id=pr.process_id
            WHERE pr.worker_id=? AND pr.work_date=? AND pr.shift=? AND pr.status <> 'deleted'
            UNION ALL
            SELECT CASE WHEN p.process_code='GC' AND EXISTS (SELECT 1 FROM production_temp_machine_lines ml WHERE ml.temp_report_id=pr.id)
                THEN COALESCE((SELECT (COALESCE(SUM(CASE WHEN UPPER(REPLACE(REPLACE(REPLACE(TRIM(ml.machine_code),'-',''),' ',''),'_','')) IN ('5','C5','M5','MAY5','MÁY5','MACHINE5','GC5','G5','6','C6','M6','MAY6','MÁY6','MACHINE6','GC6','G6','7','C7','M7','MAY7','MÁY7','MACHINE7','GC7','G7','11','C11','M11','MAY11','MÁY11','MACHINE11','GC11','G11') THEN 0 ELSE GREATEST(0,COALESCE(ml.machine_time_hours,0)) END),0) + COALESCE(MAX(CASE WHEN UPPER(REPLACE(REPLACE(REPLACE(TRIM(ml.machine_code),'-',''),' ',''),'_','')) IN ('5','C5','M5','MAY5','MÁY5','MACHINE5','GC5','G5','6','C6','M6','MAY6','MÁY6','MACHINE6','GC6','G6','7','C7','M7','MAY7','MÁY7','MACHINE7','GC7','G7','11','C11','M11','MAY11','MÁY11','MACHINE11','GC11','G11') THEN GREATEST(0,COALESCE(ml.machine_time_hours,0)) ELSE 0 END),0)) FROM production_temp_machine_lines ml WHERE ml.temp_report_id=pr.id),0)
                ELSE COALESCE(pr.total_time, COALESCE(pr.actual_time,0) + COALESCE(pr.deduction_time,0)) END AS counted_hours
            FROM production_reports_temp pr JOIN processes p ON p.id=pr.process_id
            WHERE pr.worker_id=? AND pr.work_date=? AND pr.shift=? ${tempExcludeSql} AND pr.status IN ('pending','need_fix')
        ) daily_hours`, params);
    const existingHours = Number(rows?.[0]?.counted_hours || 0);
    const incoming = isGc && Array.isArray(incomingMachineLines) && incomingMachineLines.length
        ? calculateGcShiftHours(incomingMachineLines)
        : Math.max(0, Number(incomingActualHours) || 0);
    const projectedHours = existingHours + incoming;
    if (exceedsDailyHoursLimit(projectedHours)) {
        const remainingHours = Math.max(0, DAILY_HOURS_LIMIT - existingHours);
        const error = new Error(`Tổng giờ làm được tính trong ngày không được vượt quá 12 giờ. Hiện đã có ${existingHours.toFixed(2)} giờ, báo cáo này thêm ${incoming.toFixed(2)} giờ, chỉ còn ${remainingHours.toFixed(2)} giờ.`);
        error.status = 422; error.code = "DAILY_WORKING_HOURS_LIMIT_EXCEEDED"; error.isPublic = true;
        error.details = { worker_id: worker, work_date: date, existing_hours: Number(existingHours.toFixed(4)), incoming_hours: Number(incoming.toFixed(4)), projected_hours: Number(projectedHours.toFixed(4)), limit_hours: DAILY_HOURS_LIMIT, remaining_hours: Number(remainingHours.toFixed(4)), counted_field: "gross_elapsed_hours_by_shift" };
        throw error;
    }
    return { existingHours, incomingTotalHours: incoming, projectedHours, limitHours: DAILY_HOURS_LIMIT };
};

const parseDbTimestampMs = (value) => {
    if (!value) return NaN;
    const text = String(value).trim();
    if (!text) return NaN;
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
        ? text.replace(" ", "T") + "Z"
        : text;
    const parsed = new Date(normalized).getTime();
    return Number.isFinite(parsed) ? parsed : NaN;
};

// Pending reports: the worker's 10-minute window starts when the report is created.
// Rejected reports (lifecycle pending -> rejected -> edit -> pending): the window
// starts when the reviewer rejected it. Reject writes updated_at=NOW().
const getWorkerEditWindowStart = (report) => {
    const fromRejection = String(report?.status || "").toLowerCase() === "rejected";
    const value = fromRejection ? report.updated_at : report.created_at;
    return { startMs: parseDbTimestampMs(value), value, fromRejection };
};

module.exports = {
    async updateReport(id, data, changedBy, reason = null, options = {}) {
        const connection = await getConnection();
        try {
            await beginReadCommittedTransaction(connection);
            const { isAdmin = false, workerId = null } = options;
            const isWorkerEdit = Number(workerId) > 0;
            const scopeJoin = isAdmin || isWorkerEdit ? "" : "JOIN manager_processes mp ON mp.process_id = pr.process_id";
            const scopeWhere = isAdmin ? "" : isWorkerEdit ? "AND pr.worker_id = ?" : "AND mp.manager_id = ?";
            const rows = await query(connection, `SELECT pr.* FROM production_reports_temp pr ${scopeJoin} WHERE pr.id = ? ${scopeWhere} FOR UPDATE`, isAdmin ? [id] : isWorkerEdit ? [id, workerId] : [id, changedBy]);
            const current = rows[0];
            if (!current) throw new Error("Không tìm thấy báo cáo hoặc ngoài phạm vi phụ trách");
            if (current.status === "approved") throw new Error("Báo cáo đã duyệt không thể sửa ở bảng tạm");

            // Serialize every daily-hours mutation on the worker row. The lock
            // is shared with create() so concurrent edits/creates cannot both
            // read the same daily total and then push it above 12 hours.
            if (Number.isInteger(Number(current.worker_id)) && Number(current.worker_id) > 0) {
                await query(connection, `SELECT id FROM workers WHERE id=? FOR UPDATE`, [Number(current.worker_id)]);
            }

            if (isWorkerEdit) {
                const windowStart = getWorkerEditWindowStart(current);
                if (!Number.isFinite(windowStart.startMs)) {
                    const error = new Error("Không xác định được thời điểm tạo báo cáo để kiểm tra thời gian sửa.");
                    error.status = 422; error.code = "TEMP_REPORT_EDIT_TIME_INVALID"; error.isPublic = true;
                    throw error;
                }
                const remainingMs = windowStart.startMs + WORKER_EDIT_WINDOW_MS - Date.now();
                if (remainingMs <= 0) {
                    const error = new Error(windowStart.fromRejection
                        ? "Báo cáo bị từ chối chỉ được sửa trong vòng 10 phút kể từ lúc bị từ chối."
                        : "Báo cáo chỉ được sửa trong vòng 10 phút kể từ lúc tạo.");
                    error.status = 422; error.code = "TEMP_REPORT_EDIT_WINDOW_EXPIRED"; error.isPublic = true;
                    error.details = { created_at: current.created_at, window_started_at: windowStart.value, window_from: windowStart.fromRejection ? "rejection" : "creation", edit_window_ms: WORKER_EDIT_WINDOW_MS };
                    throw error;
                }
            }

            if (options.expectedUpdatedAt && new Date(options.expectedUpdatedAt).getTime() !== new Date(current.updated_at).getTime()) {
                const error = new Error("Báo cáo đã thay đổi sau khi bạn mở. Hãy tải lại dữ liệu trước khi sửa hoặc gửi lại.");
                error.status = 409; error.code = "TEMP_REPORT_VERSION_CONFLICT"; throw error;
            }
            const resubmittingRejected = isWorkerEdit && current.status === "rejected";
            // The row was just read FOR UPDATE above; reuse it instead of a second identical SELECT.
            const oldSnapshot = await AuditService.loadTempReportSnapshot(id, connection, { report: current });
            const hasDeductions = Object.prototype.hasOwnProperty.call(data, "deductions");
            const hasDefects = Object.prototype.hasOwnProperty.call(data, "defects");
            const hasMachineLines = Object.prototype.hasOwnProperty.call(data, "machine_lines");
            const deductions = Array.isArray(data.deductions) ? data.deductions : [];
            const defects = Array.isArray(data.defects) ? data.defects : [];
            // Resolve all deduction/defect masters in at most one query per table.
            // Per-item SELECTs multiplied TiDB HTTP subrequests and could exhaust
            // the Cloudflare Worker budget before the report version was written.
            const deductionIds = [...new Set(deductions.map((item) => Number(item.deduction_type_id) || 0).filter(Boolean))];
            const deductionNames = [...new Set(deductions.map((item) => String(item.deduction_name || "").trim()).filter(Boolean))];
            const deductionClauses = [];
            const deductionParams = [Number(current.process_id)];
            if (deductionIds.length) { deductionClauses.push(`id IN (${deductionIds.map(() => "?").join(",")})`); deductionParams.push(...deductionIds); }
            if (deductionNames.length) { deductionClauses.push(`deduction_name IN (${deductionNames.map(() => "?").join(",")})`); deductionParams.push(...deductionNames); }
            const deductionMaster = deductionClauses.length
                ? await query(connection, `SELECT id,deduction_name,status FROM deduction_types WHERE process_id=? AND (${deductionClauses.join(" OR ")}) ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,id`, deductionParams)
                : [];
            const deductionById = new Map(deductionMaster.map((row) => [Number(row.id), row]));
            const deductionByName = new Map();
            for (const row of deductionMaster) {
                const key = String(row.deduction_name || "").trim();
                if (key && !deductionByName.has(key)) deductionByName.set(key, row);
            }
            const normalizedDeductions = deductions.map((item) => {
                const requestedId = Number(item.deduction_type_id) || 0;
                const master = (requestedId && deductionById.get(requestedId)) || deductionByName.get(String(item.deduction_name || "").trim());
                if (!master) throw new Error(`Nội dung thời gian trừ "${String(item.deduction_name || "").trim() || "không xác định"}" không tồn tại trong công đoạn`);
                return { deduction_type_id: Number(master.id), hours: Math.max(0, Number(item.hours) || 0) };
            });

            const defectIds = [...new Set(defects.map((item) => Number(item.defect_type_id) || 0).filter(Boolean))];
            const defectNames = [...new Set(defects.map((item) => String(item.defect_name || "").trim()).filter(Boolean))];
            const defectClauses = [];
            const defectParams = [Number(current.process_id)];
            if (defectIds.length) { defectClauses.push(`id IN (${defectIds.map(() => "?").join(",")})`); defectParams.push(...defectIds); }
            if (defectNames.length) { defectClauses.push(`defect_name IN (${defectNames.map(() => "?").join(",")})`); defectParams.push(...defectNames); }
            const defectMaster = defectClauses.length
                ? await query(connection, `SELECT id,defect_name,status FROM defect_types WHERE process_id=? AND (${defectClauses.join(" OR ")}) ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,id`, defectParams)
                : [];
            const defectById = new Map(defectMaster.map((row) => [Number(row.id), row]));
            const defectByName = new Map();
            for (const row of defectMaster) {
                const key = String(row.defect_name || "").trim();
                if (key && !defectByName.has(key)) defectByName.set(key, row);
            }
            const normalizedDefects = defects.map((item) => {
                const requestedId = Number(item.defect_type_id) || 0;
                const master = (requestedId && defectById.get(requestedId)) || defectByName.get(String(item.defect_name || "").trim());
                if (!master) throw new Error(`Loại NG "${String(item.defect_name || "").trim() || "không xác định"}" không tồn tại trong công đoạn`);
                return { defect_type_id: Number(master.id), quantity: Math.max(0, Math.trunc(Number(item.quantity) || 0)) };
            });
            const deductionTotals = new Map();
            for (const item of normalizedDeductions) deductionTotals.set(item.deduction_type_id, (deductionTotals.get(item.deduction_type_id) || 0) + item.hours);
            normalizedDeductions.length = 0;
            normalizedDeductions.push(...[...deductionTotals.entries()].filter(([, value]) => value > 0).map(([deduction_type_id, hours]) => ({ deduction_type_id, hours })));
            const defectTotals = new Map();
            for (const item of normalizedDefects) defectTotals.set(item.defect_type_id, (defectTotals.get(item.defect_type_id) || 0) + item.quantity);
            normalizedDefects.length = 0;
            normalizedDefects.push(...[...defectTotals.entries()].filter(([, value]) => value > 0).map(([defect_type_id, quantity]) => ({ defect_type_id, quantity: Math.trunc(quantity) })));
            if (hasDeductions) {
                data.deduction_time = normalizedDeductions.reduce((sum, item) => sum + item.hours, 0);
                data.actual_time = Math.max(0, Number(Object.prototype.hasOwnProperty.call(data, "actual_time") ? data.actual_time : current.actual_time) || 0);
                data.total_time = data.actual_time + data.deduction_time;
            }
            // Machine reports: NG lives on the machine lines and the controller already set tt_ng to their
            // total. The parent defect list is only the worker-declared list and must not overwrite it
            // (create() stores the controller total as-is; edit must stay consistent with that).
            const machineLinesOwnNg = (hasMachineLines && Array.isArray(data.machine_lines) && data.machine_lines.length > 0)
                || (!hasMachineLines && String(current.operation_mode || "").toUpperCase() === "MACHINE");
            if (hasDefects) {
                if (!machineLinesOwnNg) data.tt_ng = normalizedDefects.reduce((sum, item) => sum + item.quantity, 0);
                if (!hasMachineLines) {
                    const policySnapshot = Object.prototype.hasOwnProperty.call(data, "exclude_kqd_from_tt_snapshot") ? data.exclude_kqd_from_tt_snapshot : current.exclude_kqd_from_tt_snapshot;
                    if (policySnapshot === null || policySnapshot === undefined || String(policySnapshot).trim() === "") { const error = new Error("Báo cáo cũ chưa có snapshot chính sách KQD"); error.status = 422; error.code = "KQD_POLICY_SNAPSHOT_MISSING"; error.isPublic = true; throw error; }
                    const defectIds = normalizedDefects.map((item) => Number(item.defect_type_id)).filter(Boolean);
                    const codeRows = defectIds.length ? await query(connection, `SELECT id,defect_code,defect_name FROM defect_types WHERE id IN (${defectIds.map(() => "?").join(",")})`, defectIds) : [];
                    const byId = new Map(codeRows.map((row) => [Number(row.id), row]));
                    const calculationDefects = normalizedDefects.map((item) => ({ ...item, defect_code: byId.get(Number(item.defect_type_id))?.defect_code || null, defect_name: byId.get(Number(item.defect_type_id))?.defect_name || null }));
                    const output = recalculateReportOutput({ ttOk: Object.prototype.hasOwnProperty.call(data, "tt_ok") ? Number(data.tt_ok || 0) : Number(current.tt_ok || 0), defects: calculationDefects, excludeKqdFromTtSnapshot: policySnapshot });
                    data.tt_ok = output.ttOk; data.actual_output = output.actualOutput;
                }
            }
            const nextWorkDate = Object.prototype.hasOwnProperty.call(data, "work_date") ? String(data.work_date || "").slice(0,10) : String(current.work_date || "").slice(0,10);
            const nextShiftForHours = Object.prototype.hasOwnProperty.call(data, "shift") ? data.shift : current.shift;
            const nextActualTime = Object.prototype.hasOwnProperty.call(data, "actual_time") ? Math.max(0, Number(data.actual_time) || 0) : Math.max(0, Number(current.actual_time) || 0);
            const nextShiftForHours = Object.prototype.hasOwnProperty.call(data, "shift") ? data.shift : current.shift;
            let normalizedMachineLines = null;
            // The controller already resolved the process code from the same report row; only query when a
            // direct caller did not provide it.
            const processRows = options.processCode
                ? [{ process_code: options.processCode }]
                : await query(connection, `SELECT process_code FROM processes WHERE id=? LIMIT 1`, [Number(current.process_id)]);
            const isGc = String(processRows?.[0]?.process_code || "").trim().toUpperCase() === "GC";
            if (hasMachineLines) {
                // The controller validated these exact lines moments ago in the same request (options.machineLinesValidated);
                // repeating the master-data reads here only burns Worker subrequests. The locked capacity check below
                // still runs inside the transaction. Direct callers keep the full validation.
                const validation = options.machineLinesValidated === true && Array.isArray(data.machine_lines)
                    ? { valid: true, lines: data.machine_lines, errors: {} }
                    : await validateMachineLines({ processId: current.process_id, machineLines: Array.isArray(data.machine_lines) ? data.machine_lines : [], operationType: data.operation_type || current.operation_type, operationMode: "MACHINE", maxMachines: 4, workDate: nextWorkDate });
                if (!validation.valid) { const error = new Error("Thông tin máy hoặc thời gian máy không hợp lệ"); error.status = 422; error.code = "MACHINE_LINES_INVALID"; error.isPublic = true; error.details = validation.errors; throw error; }
                normalizedMachineLines = validation.lines;
                const nextShift = Object.prototype.hasOwnProperty.call(data, "shift") ? data.shift : current.shift;
                const lockedCapacity = await validateMachineWorkerCapacityLocked({ executor: connection, processCode: processRows[0]?.process_code, processId: current.process_id, machineLines: normalizedMachineLines, workerId: current.worker_id, workDate: nextWorkDate, shift: nextShift, excludeTempReportId: id });
                if (!lockedCapacity.valid) { const error = new Error("Máy đã đủ số người cho phép"); error.status = 422; error.code = "MACHINE_WORKER_LIMIT_EXCEEDED"; error.isPublic = true; error.details = lockedCapacity.errors; throw error; }
                data.machine_lines = normalizedMachineLines;
            }
            let dailyHoursMachineLines = normalizedMachineLines;
            if (isGc && !Array.isArray(dailyHoursMachineLines)) {
                const storedLines = Array.isArray(oldSnapshot?.machine_lines)
                    ? oldSnapshot.machine_lines
                    : await query(connection, `SELECT machine_code, machine_time_hours, deduction_time_hours FROM production_temp_machine_lines WHERE temp_report_id=?`, [id]);
                dailyHoursMachineLines = storedLines.map(line => ({ machine_code: line.machine_code, machine_time_hours: Math.max(0, Number(line.machine_time_hours || 0)) }));
            }
            await checkDailyHours(connection, { workerId: current.worker_id, workDate: nextWorkDate, shift: nextShiftForHours, incomingActualHours: nextActualTime + Math.max(0, Number(data.deduction_time ?? current.deduction_time) || 0), incomingMachineLines: dailyHoursMachineLines || [], isGc, excludeTempReportId: id });
            const changes = editableFields.filter(field => Object.prototype.hasOwnProperty.call(data, field)).filter(field => String(current[field] ?? "") !== String(data[field] ?? ""));
            const detailChanged = hasDeductions || hasDefects || hasMachineLines;
            if (changes.length === 0 && !detailChanged) { await rollback(connection); return { changed: false, report: current }; }
            if (changes.length > 0) {
                const assignments = changes.map(field => `\`${field}\` = ?`).join(", ");
                await query(connection, `UPDATE production_reports_temp SET ${assignments},updated_by=?,updated_at=NOW() ${resubmittingRejected ? ",status='pending',review_note=NULL,reviewed_by=NULL,approved_at=NULL" : ""} WHERE id=?`, [...changes.map(field => data[field]), changedBy, id]);
            } else {
                await query(connection, `UPDATE production_reports_temp SET updated_by=?,updated_at=NOW() ${resubmittingRejected ? ",status='pending',review_note=NULL,reviewed_by=NULL,approved_at=NULL" : ""} WHERE id=?`, [changedBy, id]);
            }
            if (hasDeductions) {
                // oldSnapshot was read in this transaction under the report row lock; nothing to delete when it was empty.
                if (!(Array.isArray(oldSnapshot?.deductions) && oldSnapshot.deductions.length === 0)) await query(connection, `DELETE FROM production_temp_deductions WHERE temp_report_id=?`, [id]);
                if (normalizedDeductions.length) {
                    const values = normalizedDeductions.map(() => "(?,?,?)").join(",");
                    const params = normalizedDeductions.flatMap((item) => [id, item.deduction_type_id, item.hours]);
                    await query(connection, `INSERT INTO production_temp_deductions (temp_report_id,deduction_type_id,hours) VALUES ${values}`, params);
                }
            }
            if (hasDefects) {
                if (!(Array.isArray(oldSnapshot?.defects) && oldSnapshot.defects.length === 0)) await query(connection, `DELETE FROM production_temp_defects WHERE temp_report_id=?`, [id]);
                if (normalizedDefects.length) {
                    const values = normalizedDefects.map(() => "(?,?,?)").join(",");
                    const params = normalizedDefects.flatMap((item) => [id, item.defect_type_id, item.quantity]);
                    await query(connection, `INSERT INTO production_temp_defects (temp_report_id,defect_type_id,quantity) VALUES ${values}`, params);
                }
            }
            if (hasMachineLines) {
                const nextShift = Object.prototype.hasOwnProperty.call(data, "shift") ? data.shift : current.shift;
                const preserveEventLinks = String(nextWorkDate).slice(0,10) === String(current.work_date).slice(0,10) && String(nextShift || "").trim() === String(current.shift || "").trim();
                await createModel.replaceMachineLines(id, normalizedMachineLines || [], connection, { preserveEventLinks, oldLines: Array.isArray(oldSnapshot?.machine_lines) ? oldSnapshot.machine_lines : undefined });
            }
            // Rows this edit did not touch (or touched from empty to empty) are identical to the "before" snapshot read in
            // this same transaction under the report row lock, so they are not read a second time.
            const unchangedDefects = Array.isArray(oldSnapshot?.defects) && (!hasDefects || (!oldSnapshot.defects.length && !normalizedDefects.length));
            const unchangedDeductions = Array.isArray(oldSnapshot?.deductions) && (!hasDeductions || (!oldSnapshot.deductions.length && !normalizedDeductions.length));
            const newSnapshot = await AuditService.loadTempReportSnapshot(id, connection, {
                defects: unchangedDefects ? oldSnapshot.defects : undefined,
                deductions: unchangedDeductions ? oldSnapshot.deductions : undefined
            });
            const changedFieldsForAudit = [...changes, ...(hasDeductions ? ["deductions"] : []), ...(hasDefects ? ["defects"] : []), ...(hasMachineLines ? ["machine_lines"] : []), ...(resubmittingRejected ? ["status","review_note","reviewed_by"] : [])];
            await query(connection, `INSERT INTO report_edit_logs (report_type,report_id,user_id,old_data,new_data,changed_fields,note) VALUES ('temp',?,?,?,?,?,?)`, [id,changedBy,JSON.stringify(oldSnapshot || null),JSON.stringify(newSnapshot || null),JSON.stringify(changedFieldsForAudit),reason || (resubmittingRejected ? "Công nhân sửa và gửi lại báo cáo" : "Cập nhật báo cáo chờ duyệt")]);
            if (newSnapshot) await AuditService.createReportVersion({ reportType:"temp", reportId:id, snapshot:newSnapshot, returnVersionNo:false, reason:reason || (resubmittingRejected ? "Gửi lại sau khi bị từ chối" : "Cập nhật báo cáo chờ duyệt"), userId:changedBy }, connection);
            await this.logAction({ reportType:"temp",reportId:id,userId:changedBy,action:resubmittingRejected ? "RESUBMIT" : "UPDATE",note:reason || `Đã sửa ${changes.length} trường${detailChanged ? " và chi tiết" : ""}` }, connection);
            await AuditService.logActivity({ userId:changedBy,action:resubmittingRejected ? "TEMP_REPORT_RESUBMITTED" : "TEMP_REPORT_UPDATED",entityType:"temp_report",entityId:id,description:resubmittingRejected ? `Gửi lại báo cáo chờ duyệt #${id} sau khi bị từ chối` : `Cập nhật báo cáo chờ duyệt #${id}`,metadata:{changed_fields:changes,deductions_changed:hasDeductions,defects_changed:hasDefects,machine_lines_changed:hasMachineLines,previous_status:current.status,new_status:resubmittingRejected ? "pending" : current.status,reason:reason || null}},connection);
            if (resubmittingRejected) {
                const reviewers = await query(connection, `SELECT DISTINCT u.id,u.role FROM users u LEFT JOIN manager_processes mp ON mp.manager_id=u.id WHERE u.status='active' AND (u.role='admin' OR (u.role IN ('manager','lead') AND mp.process_id=?))`, [current.process_id]);
                const reviewerGroups = { lead:[], manager:[], admin:[] };
                reviewers.forEach((reviewer) => { if (reviewerGroups[reviewer.role]) reviewerGroups[reviewer.role].push(reviewer.id); });
                const notification = { type:"report_resubmitted",title:"Báo cáo đã được sửa và gửi lại",message:`Báo cáo #${id} đã được công nhân chỉnh sửa sau khi bị từ chối và đang chờ duyệt lại.`,entityType:"temp_report",entityId:id };
                for (const [role,linkUrl] of [["lead","/lead/reports"],["manager","/manager/reports"],["admin","/admin/reports"]]) { const ids=reviewerGroups[role]; if (ids.length) await AuditService.notifyUsers(ids,{...notification,linkUrl},connection); }
            }
            await commit(connection);
            return { changed:true,fields:changes,details:{deductions:hasDeductions,defects:hasDefects,machine_lines:hasMachineLines} };
        } catch (error) {
            const rolledBack = await rollback(connection);
            if (rolledBack && rolledBack.ok === false) {
                // COMMIT never ran, so the database discards the open transaction; surface the original error and
                // flag that the explicit ROLLBACK failed (never report it as a clean rollback).
                error.rollbackFailed = true;
                console.error("[KTC] ROLLBACK failed after temp-report edit error", { reportId: id, original: error?.code || error?.message, rollback: rolledBack.error?.code || rolledBack.error?.message });
            }
            throw error;
        }
        finally { connection.release(); }
    }
    ,_getWorkerEditWindowStart: getWorkerEditWindowStart,
    _checkDailyHours: checkDailyHours,
    _WORKER_EDIT_WINDOW_MS: WORKER_EDIT_WINDOW_MS
};
