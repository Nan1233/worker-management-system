"use strict";

const { buildLogicalDuplicateKey } = require("./logicalDuplicateReportService");

// Pure helpers for grouping machine/product lines into child production reports.
// Keep these rules independent of transactions and DB access.
const processCodeOf = (data) => String(data?._resolved_process_code || data?.process_code || data?.extra_data?.process_code || "").trim().toUpperCase();
const isGiaCongProcess = (data) => processCodeOf(data) === "GC";
const isMaiProcess = (data) => ["MAI", "DO", "CAN", "EP"].includes(processCodeOf(data));
const shouldSplitMachineReports = (data, machineLines) =>
    Array.isArray(machineLines) && machineLines.length > 1 && (isGiaCongProcess(data) || isMaiProcess(data));

const sumLineNumber = (lines, field) => lines.reduce((sum, line) => sum + (Number(line?.[field]) || 0), 0);

// Mài: duplicate entries for the exact same physical machine + product are
// one production report. Keep the source lines so splitMachineLinePayload can
// preserve and batch all their NG/deduction details without losing quantities.
const groupMaiMachineProductLines = (machineLines) => {
    const groups = new Map();
    const additiveFields = [
        "machine_time_hours", "actual_time_hours", "deduction_time_hours",
        "standard_output", "counted_output", "maximum_output", "earned_standard_hours",
        "ok_quantity", "ng_quantity"
    ];
    for (const line of Array.isArray(machineLines) ? machineLines : []) {
        const machine = String(line?.machine_code || "").trim().toUpperCase();
        const product = String(line?.product_code || "").trim().toUpperCase();
        // Do not silently combine incomplete rows; normal validation handles them.
        if (!machine || !product) {
            const uniqueKey = `__UNMATCHED__:${groups.size}`;
            groups.set(uniqueKey, { ...line, _source_machine_lines: [line] });
            continue;
        }
        const key = `${machine}::${product}`;
        const existing = groups.get(key);
        if (!existing) {
            const grouped = { ...line, _source_machine_lines: [line] };
            for (const field of additiveFields) grouped[field] = Number(line?.[field]) || 0;
            groups.set(key, grouped);
            continue;
        }
        existing._source_machine_lines.push(line);
        for (const field of additiveFields) {
            existing[field] = (Number(existing[field]) || 0) + (Number(line?.[field]) || 0);
        }
        existing.defects = [
            ...(Array.isArray(existing.defects) ? existing.defects : []),
            ...(Array.isArray(line?.defects) ? line.defects : [])
        ];
        existing.deductions = [
            ...(Array.isArray(existing.deductions) ? existing.deductions : []),
            ...(Array.isArray(line?.deductions) ? line.deductions : [])
        ];
    }
    return [...groups.values()];
};
// Stable child request IDs are keyed by physical machine, not product line.
const childRequestId = (groupRequestId, lines, index) => {
    const line = Array.isArray(lines) ? (lines[0] || {}) : (lines || {});
    // A report belongs to a product line, not to a physical machine. Include
    // product identity and position so two products on the same machine never collide.
    const identity = [
        String(line.machine_code || "").trim().toUpperCase(),
        String(line.product_code || "").trim().toUpperCase(),
        String(index)
    ].join("|");
    const digest = require("node:crypto").createHash("sha256").update(identity).digest("hex").slice(0, 20);
    return `${String(groupRequestId).slice(0, 80)}:line:${digest}`;
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


module.exports = {
    isGiaCongProcess,
    isMaiProcess,
    shouldSplitMachineReports,
    groupMaiMachineProductLines,
    childRequestId,
    splitMachineLinePayload,
};
