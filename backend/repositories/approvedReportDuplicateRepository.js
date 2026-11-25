'use strict';
const db = require('../config/db');
const { query } = require('../models/productionTempModelShared');
const { buildLogicalDuplicateKey } = require('../services/logicalDuplicateReportService');

const findSimilarApprovedReport = async ({ workerId, processId, workDate, shift, logicalDuplicateKey }, executor = db) => {
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

module.exports = { findSimilarApprovedReport };
