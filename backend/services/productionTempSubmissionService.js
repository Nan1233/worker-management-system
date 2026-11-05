// Coordinates production-report submission. Data access remains in the focused model modules.
const db = require("../config/db");
const createModel = require("../models/productionTempCreateModel");
const nonProductWorkModel = require("../models/nonProductWorkCreateModel");
const AuditService = require("./auditService");
const { query, getConnection, beginTransaction, beginReadCommittedTransaction, commit, rollback } = require("../models/productionTempModelShared");
const { resolveInitialTrainingSnapshot } = require("./trainingSnapshotService");
const { validateMachineWorkerCapacityLocked } = require("./factoryMachineRuleService");
const { buildLogicalDuplicateKey } = require("./logicalDuplicateReportService");
const { verifyDuplicateConfirmation } = require("./duplicateConfirmationService");
const { DAILY_HOURS_LIMIT, exceedsDailyHoursLimit } = require("../utils/dailyHoursLimit");
const { queryCountedDailyHours } = require("../utils/dailyCountedHours");
const { groupMaiLinesByMachine } = require("../utils/groupMaiLinesByMachine");

const submissionQueues = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const rollbackOrThrow = async (connection, originalError) => {
    const result = await rollback(connection);
    if (result?.ok === false) {
        const error = new Error("Không thể rollback transaction sau lỗi ghi báo cáo");
        error.code = "TRANSACTION_ROLLBACK_FAILED";
        error.cause = result.error;
        error.originalError = originalError || null;
        error.isPublic = false;
        throw error;
    }
    return result;
};

const runSerialized = async (key, task) => {
    const previous = submissionQueues.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    submissionQueues.set(key, current);
    await previous;
    try { return await task(); }
    finally {
        release();
        if (submissionQueues.get(key) === current) submissionQueues.delete(key);
    }
};

const queueKey = (data, machineLines = []) => {
    const workerId = Number(data?.worker_id || data?.workerId || 0);
    const client = String(data?.client_request_id || "").trim();
    if (client) return `client:${workerId}:${client}`;
    const logical = String(data?.logical_duplicate_key || "").trim();
    if (logical) return `logical:${workerId}:${logical}`;
    const machines = [...new Set((Array.isArray(machineLines) ? machineLines : [])
        .map((x) => String(x?.machine_code || "").trim().toUpperCase()).filter(Boolean))].sort().join(",");
    return `capacity:${workerId}:${Number(data?.process_id || 0)}:${String(data?.work_date || "").slice(0,10)}:${String(data?.shift || "").trim().toUpperCase()}:${machines}`;
};

const findExistingClientRequest = async (data, executor = db) => {
    const workerId = Number(data?.worker_id);
    const requestId = String(data?.client_request_id || "").trim();
    if (!Number.isInteger(workerId) || workerId <= 0 || !requestId) return null;
    // Resolve ordinary requests and grouped per-machine submissions (GC legacy + Mài).
    // Exact child request IDs take precedence; a group retry returns every child report.
    const matches = await query(executor,
        `SELECT id, status, client_request_id,
                JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.gc_group_request_id')) AS gc_group_request_id,
                JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.machine_group_request_id')) AS machine_group_request_id
           FROM production_reports_temp
          WHERE worker_id=?
            AND (client_request_id=?
                 OR JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.gc_group_request_id'))=?
                 OR JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.machine_group_request_id'))=?)
          ORDER BY id ASC`,
        [workerId, requestId, requestId, requestId]);
    const exact = matches.find((row) => String(row.client_request_id || "") === requestId);
    if (exact) return exact;
    if (!matches.length) return null;
    const grouped = matches.filter((row) =>
        String(row.gc_group_request_id || "") === requestId
        || String(row.machine_group_request_id || "") === requestId
    );
    if (!grouped.length) return null;
    return { ...grouped[0], machine_group_ids: grouped.map((row) => Number(row.id)) };
};

const idempotent = (row) => ({
    id: Number(row.id),
    ids: Array.isArray(row.machine_group_ids) ? row.machine_group_ids
        : (Array.isArray(row.gc_group_ids) ? row.gc_group_ids : [Number(row.id)]),
    duplicate: true, duplicate_reason: "request_id", existing_report: row
});

const assertNoLogicalDuplicate = async (data, executor = db) => {
    const input = {
        workerId: data.worker_id,
        processId: data.process_id,
        workDate: data.work_date,
        shift: data.shift,
        machineNo: data.machine_no,
        productName: data.product_name,
        logicalDuplicateKey: data.logical_duplicate_key
    };
    const tempDuplicate = await createModel.findSimilarTempReport(input, executor);
    const approvedDuplicate = tempDuplicate ? null : await createModel.findSimilarApprovedReport(input, executor);
    const existing = tempDuplicate || approvedDuplicate;
    if (existing && !data.force_create) {
        const error = new Error("Báo cáo trùng với báo cáo đã tồn tại trong cùng ngày/ca");
        error.status = 409; error.code = "DUPLICATE_CONFIRMATION_REQUIRED"; error.isPublic = true;
        error.existing_report = existing; error.details = existing; throw error;
    }
    if (existing && data.force_create) {
        const confirmation = verifyDuplicateConfirmation(data.duplicate_confirmation_token, {
            workerId: data.worker_id, logicalDuplicateKey: data.logical_duplicate_key,
            existingReportId: existing.id, existingReportType: existing.report_type || "temp"
        });
        if (!confirmation.valid) {
            const error = new Error("Xác nhận tạo báo cáo trùng không hợp lệ hoặc đã hết hạn");
            error.status = 409; error.code = "DUPLICATE_CONFIRMATION_REQUIRED"; error.isPublic = true;
            error.existing_report = existing; throw error;
        }
    } else if (!existing && data.force_create) {
        const error = new Error("Không có báo cáo trùng hợp lệ để xác nhận tạo lần thứ hai");
        error.status = 409; error.code = "DUPLICATE_CONFIRMATION_REQUIRED"; error.isPublic = true; throw error;
    }
};
const is1205 = (error) => Number(error?.errno) === 1205 || /lock wait timeout exceeded|error 1205/i.test(String(error?.message || ""));

const recoverAfter1205 = async (data) => {
    for (const delay of [0, 150, 500, 1000]) {
        if (delay) await sleep(delay);
        const existing = await findExistingClientRequest(data);
        if (existing) return idempotent(existing);
    }
    const error = new Error("Yêu cầu gửi báo cáo đang bị một yêu cầu khác xử lý. Vui lòng bấm gửi lại.");
    error.status = 409; error.code = "PRODUCTION_SUBMISSION_CONFLICT"; error.isPublic = true;
    throw error;
};

const enforceDailyWorkerHours = async (data, executor = db, machineLines = []) => {
    const workerId = Number(data?.worker_id);
    const workDate = String(data?.work_date || "").slice(0, 10);
    if (!Number.isInteger(workerId) || workerId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return null;
    const processRows = await query(executor, `SELECT process_code FROM processes WHERE id=? LIMIT 1`, [Number(data?.process_id)]);
    const resolvedProcessCode = String(processRows?.[0]?.process_code || "").trim().toUpperCase();
    // Keep the DB-resolved process code for the later persistence transaction. This
    // avoids repeating the same master-data lookup and lets the locked daily-hours
    // check reuse the authoritative value rather than issuing another SELECT.
    if (resolvedProcessCode) {
        data.process_code = resolvedProcessCode;
        data._resolved_process_code = resolvedProcessCode;
    }
    const resolvedCode = resolvedProcessCode || String(data?.process_code || data?.extra_data?.process_code || "").trim().toUpperCase();
    const isParallelMachineProcess = resolvedCode === "GC" || resolvedCode === "MAI";
    const incoming = isParallelMachineProcess && machineLines.length
        ? (() => {
            const netHoursByMachine = new Map();
            for (const line of machineLines) {
                const machine = String(line?.machine_code || line?.machine_id || "").trim().toUpperCase() || "__UNKNOWN__";
                const net = Math.max(0, (Number(line?.machine_time_hours ?? line?.actual_time_hours) || 0)
                    - (Number(line?.deduction_time_hours ?? line?.deduction_time ?? 0) || 0));
                netHoursByMachine.set(machine, (netHoursByMachine.get(machine) || 0) + net);
            }
            return Math.max(0, ...netHoursByMachine.values());
        })()
        : (Number(data?.actual_time) || 0);
    const existing = await queryCountedDailyHours((sql, params) => query(executor, sql, params), { workerId, workDate });
    const projected = existing + incoming;
    if (exceedsDailyHoursLimit(projected)) {
        const error = new Error(`Tổng giờ làm trong ngày không được vượt quá 12 giờ. Hiện đã có ${existing.toFixed(2)} giờ, báo cáo này thêm ${incoming.toFixed(2)} giờ.`);
        error.status = 422; error.code = "DAILY_WORKING_HOURS_LIMIT_EXCEEDED"; error.isPublic = true;
        error.details = { worker_id: workerId, work_date: workDate, existing_hours: Number(existing.toFixed(4)), incoming_hours: Number(incoming.toFixed(4)), projected_hours: Number(projected.toFixed(4)), limit_hours: DAILY_HOURS_LIMIT, counted_field: "actual_time_or_gc_machine_line_actual_time" };
        throw error;
    }
    return { existingHours: existing, incomingActualHours: incoming, projectedHours: existing + incoming, limitHours: DAILY_HOURS_LIMIT };
};

createModel.findSimilarApprovedReport = async ({ workerId, processId, workDate, shift, logicalDuplicateKey }, executor = db) => {
    if (!logicalDuplicateKey) return null;
    const rows = await query(executor,
        `SELECT id, worker_id, process_id, work_date, shift, operation_mode, machine_no, product_name, extra_data, status, created_at, updated_at
         FROM production_reports WHERE worker_id=? AND process_id=? AND work_date=? AND shift=? AND status <> 'deleted' ORDER BY id DESC`,
        [workerId, processId, workDate, shift]);
    if (!rows.length) return null;
    const ids = rows.map((r) => Number(r.id)).filter(Boolean);
    const machineRows = await query(executor,
        `SELECT report_id,machine_code,product_code,sort_order,id FROM production_report_machine_lines
         WHERE report_id IN (${ids.map(() => '?').join(',')}) ORDER BY report_id,sort_order,id`, ids);
    const byReport = new Map();
    for (const line of machineRows) {
        const id = Number(line.report_id);
        if (!byReport.has(id)) byReport.set(id, []);
        byReport.get(id).push(line);
    }
    for (const row of rows) {
        const key = buildLogicalDuplicateKey({
            workerId: row.worker_id, processId: row.process_id, workDate: row.work_date,
            shift: row.shift, operationMode: row.operation_mode, machineNo: row.machine_no,
            productName: row.product_name, workType: (() => { try { const extra = typeof row.extra_data === "string" ? JSON.parse(row.extra_data) : row.extra_data; return String(extra?.work_type || "").trim(); } catch { return ""; } })(), machineLines: byReport.get(Number(row.id)) || []
        });
        if (key === logicalDuplicateKey) return { ...row, report_type: "approved" };
    }
    return null;
};

const resolveMasterDetails = async (processId, defects, deductions, executor) => {
    const defectItems = (Array.isArray(defects) ? defects : []).map((item) => ({
        id: Number(item?.defect_type_id || item?.id || 0) || null,
        code: String(item?.defect_code || item?.defect_type_code || item?.code || "").trim(),
        name: String(item?.defect_name || item?.name || item?.label || "").trim(),
        quantity: Math.trunc(Number(item?.quantity ?? item?.qty ?? item?.ng_quantity ?? 0) || 0)
    })).filter((x) => x.quantity > 0);

    const deductionItems = (Array.isArray(deductions) ? deductions : []).map((item) => ({
        id: Number(item?.deduction_type_id || item?.id || 0) || null,
        code: String(item?.deduction_code || item?.code || "").trim(),
        name: String(item?.deduction_name || item?.name || item?.label || "").trim(),
        hours: Number(item?.hours ?? item?.deduction_hours ?? 0) || 0
    })).filter((x) => x.hours > 0);

    const resolve = async (table, items, label) => {
        if (!items.length) return [];
        const ids = [...new Set(items.map((x) => x.id).filter(Boolean))];
        const codes = [...new Set(items.map((x) => x.code).filter(Boolean))];
        const names = [...new Set(items.map((x) => x.name).filter(Boolean))];
        const clauses = [];
        const params = [Number(processId)];
        if (ids.length) { clauses.push(`id IN (${ids.map(() => "?").join(",")})`); params.push(...ids); }
        if (codes.length) { clauses.push(`${table === "defect_types" ? "defect_code" : "deduction_code"} IN (${codes.map(() => "?").join(",")})`); params.push(...codes); }
        if (names.length) { clauses.push(`${table === "defect_types" ? "defect_name" : "deduction_name"} IN (${names.map(() => "?").join(",")})`); params.push(...names); }
        const rows = await query(executor,
            `SELECT id, ${table === "defect_types" ? "defect_code, defect_name" : "deduction_code, deduction_name"}
             FROM ${table} WHERE process_id=? AND status='active' AND (${clauses.join(" OR ")})`, params);
        const byId = new Map(rows.map((r) => [Number(r.id), r]));
        const codeField = table === "defect_types" ? "defect_code" : "deduction_code";
        const nameField = table === "defect_types" ? "defect_name" : "deduction_name";
        const byCode = new Map(rows.map((r) => [String(r[codeField] || "").trim().toUpperCase(), r]));
        const byName = new Map(rows.map((r) => [String(r[nameField] || "").trim(), r]));
        return items.map((item) => {
            const master = (item.id && byId.get(item.id)) || (item.code && byCode.get(item.code.toUpperCase())) || (item.name && byName.get(item.name));
            if (!master) {
                const error = new Error(`Không xác định được ${label}: ${item.code || item.name || item.id}`);
                error.status = 422; error.code = label === "loại lỗi NG" ? "DEFECT_TYPE_NOT_FOUND" : "DEDUCTION_TYPE_NOT_FOUND";
                error.isPublic = true; error.details = { process_id: processId, item }; throw error;
            }
            if (table === "defect_types") return { defect_type_id: Number(master.id), defect_code: master.defect_code || "", defect_name: master.defect_name || "", quantity: item.quantity };
            return { deduction_type_id: Number(master.id), deduction_code: master.deduction_code || "", deduction_name: master.deduction_name || "", hours: item.hours };
        });
    };

    const resolvedDefects = await resolve("defect_types", defectItems, "loại lỗi NG");
    const resolvedDeductions = await resolve("deduction_types", deductionItems, "loại trừ giờ");
    const defectTotals = new Map();
    for (const item of resolvedDefects) defectTotals.set(item.defect_type_id, (defectTotals.get(item.defect_type_id) || 0) + item.quantity);
    const deductionTotals = new Map();
    for (const item of resolvedDeductions) deductionTotals.set(item.deduction_type_id, (deductionTotals.get(item.deduction_type_id) || 0) + item.hours);
    return {
        defects: [...defectTotals.entries()].map(([id, quantity]) => {
            const source = resolvedDefects.find((x) => x.defect_type_id === id);
            return { ...source, defect_type_id: id, quantity };
        }),
        deductions: [...deductionTotals.entries()].map(([id, hours]) => {
            const source = resolvedDeductions.find((x) => x.deduction_type_id === id);
            return { ...source, deduction_type_id: id, hours };
        })
    };
};

const validateChildTotals = (data, defects, deductions) => {
    const expectedNg = Math.max(0, Math.trunc(Number(data?.tt_ng || 0) || 0));
    const actualNg = defects.reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item.quantity) || 0)), 0);
    if (expectedNg !== actualNg) {
        const error = new Error(`Chi tiết NG (${actualNg}) không khớp TT NG (${expectedNg})`);
        error.status = 422; error.code = "NG_DETAIL_TOTAL_MISMATCH"; error.isPublic = true; error.details = { expected: expectedNg, actual: actualNg }; throw error;
    }
    const expectedMinutes = Math.round((Number(data?.deduction_time || 0) || 0) * 60);
    const actualMinutes = Math.round(deductions.reduce((sum, item) => sum + (Number(item.hours) || 0), 0) * 60);
    // The form stores 70 minutes as 1.17 hours while the canonical detail is
    // 70/60 = 1.166666... . Compare rounded minutes, not raw decimals.
    if (Math.abs(expectedMinutes - actualMinutes) > 1) {
        const error = new Error(`Chi tiết trừ giờ (${actualMinutes} phút) không khớp tổng trừ giờ (${expectedMinutes} phút)`);
        error.status = 422; error.code = "DEDUCTION_DETAIL_TOTAL_MISMATCH"; error.isPublic = true; error.details = { expectedMinutes, actualMinutes }; throw error;
    }
};

const createAuditAfterChildren = async ({ tempId, audit, data, requestId, logicalDuplicateKey }) => {
    const connection = await getConnection();
    try {
        await beginTransaction(connection);
        const snapshot = await AuditService.loadTempReportSnapshot(tempId, connection);
        if (snapshot) await AuditService.createReportVersion({ reportType: "temp", reportId: tempId, snapshot, reason: "Tạo báo cáo chờ duyệt", userId: Number(audit?.userId || 0) }, connection);
        await createModel.logAction({ reportType: "temp", reportId: tempId, userId: Number(audit?.userId || 0), action: "CREATE", note: audit?.note || "Công nhân tạo báo cáo", ipAddress: audit?.ipAddress || null, userAgent: audit?.userAgent || null }, connection);
        await query(connection,
            `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, metadata_json, ip_address, user_agent)
             VALUES (?, 'CREATE_REPORT', 'temp_report', ?, ?, ?, ?, ?)`,
            [Number(audit?.userId || 0), String(tempId), "Công nhân tạo báo cáo chờ duyệt",
                JSON.stringify({ processId: data.process_id, workDate: data.work_date, shift: data.shift, clientRequestId: requestId, logicalDuplicateKey }), audit?.ipAddress || null, audit?.userAgent || null]);
        await commit(connection);
    } catch (error) { await rollbackOrThrow(connection, error); throw error; }
    finally { connection.release(); }
};

const processCodeOf = (data) => String(data?._resolved_process_code || data?.process_code || data?.extra_data?.process_code || "").trim().toUpperCase();
const isGiaCongProcess = (data) => processCodeOf(data) === "GC";
const isMaiProcess = (data) => processCodeOf(data) === "MAI";
const shouldSplitMachineReports = (data, machineLines) =>
    Array.isArray(machineLines) && machineLines.length > 1 && (isGiaCongProcess(data) || isMaiProcess(data));

const sumLineNumber = (lines, field) => lines.reduce((sum, line) => sum + (Number(line?.[field]) || 0), 0);
// Stable child request IDs are keyed by physical machine, not product line.
const childRequestId = (groupRequestId, lines, index) => {
    const machineCode = Array.isArray(lines) ? lines[0]?.machine_code : lines?.machine_code;
    const identity = String(machineCode || index).trim().toUpperCase();
    const digest = require("node:crypto").createHash("sha256").update(identity).digest("hex").slice(0, 20);
    return `${String(groupRequestId).slice(0, 80)}:machine:${digest}`;
};

const splitMachineLinePayload = (data, lineOrLines, requestId, index, totalCount = 1) => {
    const lines = Array.isArray(lineOrLines) ? lineOrLines : [lineOrLines];
    const line = lines[0] || {};
    const defects = lines.flatMap((item) => Array.isArray(item?.defects) ? item.defects : []);
    const deductions = lines.flatMap((item) => Array.isArray(item?.deductions) ? item.deductions : []);
    const extra = typeof data.extra_data === "string" ? (() => { try { return JSON.parse(data.extra_data); } catch { return {}; } })() : (data.extra_data || {});
    const groupMetadata = isGiaCongProcess(data)
        ? { gc_group_request_id: requestId, gc_group_machine_count: totalCount, gc_group_machine_index: index, gc_split_report: true }
        : { machine_group_request_id: requestId, machine_group_machine_count: totalCount, machine_group_machine_index: index, machine_split_report: true };
    const productCodes = [...new Set(lines.map((item) => String(item?.product_code || "").trim()).filter(Boolean))];
    return {
        ...data,
        machine_no: line.machine_code || data.machine_no || null,
        product_name: productCodes.join(", ") || data.product_name || null,
        total_time: sumLineNumber(lines, "machine_time_hours"),
        actual_time: 0,
        deduction_time: sumLineNumber(lines, "deduction_time_hours"),
        standard_output: sumLineNumber(lines, "standard_output"),
        standard_version_id: lines.every((item) => String(item?.standard_version_id || "") === String(line?.standard_version_id || "")) ? (line.standard_version_id || null) : null,
        machine_standard_id: lines.every((item) => String(item?.machine_standard_id || "") === String(line?.machine_standard_id || "")) ? (line.machine_standard_id || null) : null,
        actual_output: sumLineNumber(lines, "counted_output"),
        tt_ok: sumLineNumber(lines, "ok_quantity"),
        tt_ng: sumLineNumber(lines, "ng_quantity"),
        defects,
        deductions,
        client_request_id: childRequestId(requestId, lines, index),
        logical_duplicate_key: buildLogicalDuplicateKey({
            workerId: data.worker_id, processId: data.process_id, workDate: data.work_date,
            shift: data.shift, operationMode: data.operation_mode ?? data.operationMode,
            machineNo: line.machine_code || data.machine_no,
            productName: productCodes.join(", ") || data.product_name,
            machineLines: lines
        }),
        extra_data: { ...extra, ...groupMetadata }
    };
};

const createCompleteReport = async (payload = {}, legacyDefects, legacyDeductions, legacyMachineLines, legacyAudit) => {
    const wrapped = payload && typeof payload === "object" && payload.data && typeof payload.data === "object";
    const raw = wrapped ? payload.data : payload;
    const data = { ...(raw || {}), worker_id: raw?.worker_id ?? raw?.workerId ?? null };
    const defectsInput = wrapped ? (Array.isArray(payload.defects) ? payload.defects : []) : (Array.isArray(legacyDefects) ? legacyDefects : []);
    const deductionsInput = wrapped ? (Array.isArray(payload.deductions) ? payload.deductions : []) : (Array.isArray(legacyDeductions) ? legacyDeductions : []);
    const machineLines = wrapped ? (Array.isArray(payload.machineLines) ? payload.machineLines : []) : (Array.isArray(legacyMachineLines) ? legacyMachineLines : []);
    const audit = wrapped ? (payload.audit || {}) : (legacyAudit || {});
    const workerId = Number(data.worker_id);
    if (!Number.isInteger(workerId) || workerId <= 0) { const e = new Error("Không xác định được nhân viên để tạo báo cáo"); e.status = 422; e.code = "TRAINING_SNAPSHOT_WORKER_REQUIRED"; e.isPublic = true; throw e; }
    const requestId = String(data.client_request_id || "").trim();
    if (!requestId) { const e = new Error("Thiếu mã yêu cầu gửi báo cáo"); e.status = 400; e.code = "CLIENT_REQUEST_ID_REQUIRED"; e.isPublic = true; throw e; }

    const existingRequest = await findExistingClientRequest(data);
    if (existingRequest) return idempotent(existingRequest);

    const processCode = String(data.process_code || data.extra_data?.process_code || "").trim().toUpperCase();
    if (Number(data.process_id) === 60006 || Number(data.process_id) === 30002 || processCode === "CVK") {
        data.process_id = 30002; data.process_code = "CVK";
        await enforceDailyWorkerHours(data);
        return nonProductWorkModel.createCompleteReport({ data, defects: defectsInput, deductions: deductionsInput, audit });
    }

    await enforceDailyWorkerHours(data, db, machineLines);
    data._daily_hours_machine_lines = machineLines;
    // enforceDailyWorkerHours resolves the authoritative process code from DB.
    // Group only after that lookup so clients need not send process_code.
    const reportMachineLines = isMaiProcess(data) ? groupMaiLinesByMachine(machineLines) : machineLines;
    const splitMachines = (isMaiProcess(data) && machineLines.length > 1) || shouldSplitMachineReports(data, reportMachineLines);
    return runSerialized(queueKey(data, machineLines), async () => {
        // No second pre-transaction idempotency lookup here: sequential retries already returned above,
        // and a concurrent duplicate is resolved authoritatively inside the transaction under the
        // client_request_id lock (findExistingClientRequest(data, parentConnection)). Each statement is one
        // Cloudflare subrequest (limit 50), so the redundant 2-statement lookup was removed.

        data.logical_duplicate_key = buildLogicalDuplicateKey({ workerId: data.worker_id, processId: data.process_id, workDate: data.work_date, shift: data.shift, operationMode: data.operation_mode ?? data.operationMode, machineNo: data.machine_no, productName: data.product_name, workType: data.work_type || data.extra_data?.work_type, machineLines });


        const resolvedProcessCode = String(data._resolved_process_code || "").trim().toUpperCase();
        const processRows = resolvedProcessCode
            ? [{ process_code: resolvedProcessCode }]
            : await query(db, `SELECT process_code FROM processes WHERE id=? LIMIT 1`, [Number(data.process_id)]);
        data.process_code = processRows[0]?.process_code || data.process_code || null;
        if (processRows[0]?.process_code) data._resolved_process_code = String(processRows[0].process_code).trim().toUpperCase();

        // Đo is strictly one worker / one machine. Reject malformed multi-machine
        // payloads rather than creating misleading split reports.
        if (processCodeOf(data) === "DO" && machineLines.length !== 1) {
            const error = new Error("Công đoạn Đo chỉ cho phép một công nhân báo cáo trên một máy mỗi lần.");
            error.status = 422; error.code = "DO_SINGLE_MACHINE_REQUIRED"; error.isPublic = true;
            error.details = { process_code: "DO", machine_line_count: machineLines.length, required_machine_line_count: 1 };
            throw error;
        }
        const training = await resolveInitialTrainingSnapshot({ executor: db, workerId: data.worker_id, processId: data.process_id, workDate: data.work_date, trainingPercent: data.training_percent });
        data.training_percent_snapshot = Number(training);
        data.standard_version_id = data.standard_version_id || null;
        data.machine_standard_id = data.machine_standard_id || null;

        const auditUserId = Number(audit?.userId || 0);
        if (!Number.isInteger(auditUserId) || auditUserId <= 0) { const e = new Error("Không xác định được người tạo báo cáo để ghi audit"); e.status = 422; e.code = "REPORT_AUDIT_ACTOR_REQUIRED"; e.isPublic = true; throw e; }

        // Preflight the exact master rows before the parent INSERT. This makes
        // it impossible to create a report that only has tt_ng/deduction_time.
        const validationConnection = await getConnection();
        let defects;
        let deductions;
        try {
            await beginTransaction(validationConnection);
            if (splitMachines) {
                // Validate each machine's NG and deduction details against its own parent report.
                for (const [index, line] of reportMachineLines.entries()) {
                    const childData = splitMachineLinePayload(data, line._source_machine_lines || [line], requestId, index, reportMachineLines.length);
                    const resolved = await resolveMasterDetails(data.process_id, childData.defects, childData.deductions, validationConnection);
                    validateChildTotals(childData, resolved.defects, resolved.deductions);
                }
                defects = [];
                deductions = [];
            } else {
                const resolved = await resolveMasterDetails(data.process_id, defectsInput, deductionsInput, validationConnection);
                defects = resolved.defects;
                deductions = resolved.deductions;
                validateChildTotals(data, defects, deductions);
            }
            await rollbackOrThrow(validationConnection);
        } catch (error) {
            try { await rollbackOrThrow(validationConnection, error); } catch (rollbackError) { throw rollbackError; }
            throw error;
        } finally { validationConnection.release(); }

        let tempId;
        const createdIds = [];
        const parentConnection = await getConnection();
        try {
            // Keep the report parent and every child row in ONE transaction.
            // Committing the parent first allowed a detail-write failure to leave
            // a partial report marked need_fix; a retry with the same request ID
            // then incorrectly returned that incomplete row as a successful duplicate.
            await beginReadCommittedTransaction(parentConnection);
            await createModel.lockClientRequestId(workerId, requestId, parentConnection);
            const race = await findExistingClientRequest(data, parentConnection);
            if (race) { await commit(parentConnection); return idempotent(race); }
            await createModel.lockLogicalDuplicateKey(data.logical_duplicate_key, parentConnection);
            await assertNoLogicalDuplicate(data, parentConnection);
            if (machineLines.length) {
                await createModel.lockMachineCapacityKeys(data.process_id, data.work_date, data.shift, machineLines, parentConnection);
                const capacity = await validateMachineWorkerCapacityLocked({
                    executor: parentConnection,
                    processCode: processRows[0]?.process_code,
                    processId: data.process_id,
                    machineLines,
                    workerId: data.worker_id,
                    workDate: data.work_date,
                    shift: data.shift
                });
                if (!capacity.valid) {
                    const error = new Error("Số công nhân trên máy vượt giới hạn trong cùng ngày/ca");
                    error.status = 422;
                    error.code = "MACHINE_WORKER_LIMIT_EXCEEDED";
                    error.isPublic = true;
                    error.details = capacity.errors;
                    throw error;
                }
            }
            try {
                if (splitMachines) {
                    // All machine-specific parent reports and child rows are committed together.
                    for (const [index, line] of reportMachineLines.entries()) {
                        const childLines = line._source_machine_lines || [line];
                        const childData = splitMachineLinePayload(data, childLines, requestId, index, reportMachineLines.length);
                        childData._skip_daily_hours_enforcement = index > 0; // Enforce once under the worker lock; later machine children must not count the same group again.
                        const resolved = await resolveMasterDetails(data.process_id, childData.defects, childData.deductions, parentConnection);
                        validateChildTotals(childData, resolved.defects, resolved.deductions);
                        tempId = await createModel.create(childData, parentConnection);
                        createdIds.push(Number(tempId));
                        await createModel.createDefects(tempId, data.process_id, resolved.defects, parentConnection);
                        await createModel.createDeductions(tempId, data.process_id, resolved.deductions, parentConnection);
                        await createModel.replaceMachineLines(tempId, childLines, parentConnection, { isNewReport: true }); // inserted in this transaction: no old lines to read/delete
                    }
                } else {
                    tempId = await createModel.create(data, parentConnection);
                    createdIds.push(Number(tempId));
                    await createModel.createDefects(tempId, data.process_id, defects, parentConnection);
                    await createModel.createDeductions(tempId, data.process_id, deductions, parentConnection);
                    await createModel.replaceMachineLines(tempId, machineLines, parentConnection, { isNewReport: true }); // inserted in this transaction: no old lines to read/delete
                }
                await commit(parentConnection);
            } catch (error) {
                await rollbackOrThrow(parentConnection, error);
                if (error?.code === "ER_DUP_ENTRY") { const existing = await findExistingClientRequest(data); if (existing) return idempotent(existing); }
                if (is1205(error)) return recoverAfter1205(data);
                const e = new Error(`Không thể lưu báo cáo: ${String(error?.message || error)}`);
                e.status = Number(error?.status) >= 400 ? Number(error.status) : 422;
                e.code = error?.code || "REPORT_PERSIST_FAILED";
                e.isPublic = true; e.details = error?.details || { temp_report_id: tempId || null }; throw e;
            }
        } finally { parentConnection.release(); }

        // Audit/version work stays separate so an audit failure cannot undo an
        // already committed, complete report and its NG/trừ giờ/machine details.
        let auditWarning = null;
        for (const createdId of createdIds) {
            try { await createAuditAfterChildren({ tempId: createdId, audit, data, requestId: splitMachines ? childRequestId(requestId, reportMachineLines[createdIds.indexOf(createdId)]?._source_machine_lines || [reportMachineLines[createdIds.indexOf(createdId)]], createdIds.indexOf(createdId)) : requestId, logicalDuplicateKey: data.logical_duplicate_key }); }
            catch (error) {
                auditWarning = String(error?.message || error).slice(0,450);
                try { await query(db, `UPDATE production_reports_temp SET review_note=? WHERE id=?`, [`Audit chưa hoàn tất: ${auditWarning}`, createdId]); } catch {}
            }
        }

        return { id: Number(createdIds[0] || tempId), ids: createdIds, reports: createdIds.map((id, index) => ({ id, machine_code: splitMachines ? reportMachineLines[index]?.machine_code || null : null })), duplicate: false, duplicate_reason: null, existing_report: null, logical_duplicate_key: data.logical_duplicate_key, audit_warning: auditWarning };
    });
};


module.exports = { createCompleteReport, enforceDailyWorkerHours };
