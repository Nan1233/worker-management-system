const db = require("../config/db");
const workerController = require("./productionTempWorkerController");
const managementController = require("./productionTempManagementController");
const ProductionTemp = require("../models/productionTempModel");
const { resolveStandard } = require("../services/standardResolutionService");
const { rejectSelectedTempReports } = require("../services/rejectSelectedTempReportsService");
const { issueDuplicateConfirmation } = require("../services/duplicateConfirmationService");
const { buildLogicalDuplicateKey } = require("../services/logicalDuplicateReportService");

const normalizeMode = (value) => String(value || "").trim().toUpperCase();
const finiteNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const findExistingCvkReport = async (req) => {
    const workerId = Number(req.user?.worker_id || req.body?.worker_id);
    const workDate = String(req.body?.work_date || "").slice(0, 10);
    const shift = String(req.body?.shift || "").trim();
    const workType = String(req.body?.extra_data?.work_type || req.body?.work_type || "").trim();
    if (!Number.isInteger(workerId) || workerId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !shift || !workType) return null;

    const params = [workerId, workDate, shift, workType];
    const [tempRows] = await db.promise().query(
        `SELECT id, status, work_date, shift, actual_time, deduction_time, total_time,
                'temp' AS report_type
           FROM production_reports_temp
          WHERE worker_id=? AND process_id=60006 AND work_date=? AND shift=?
            AND UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.work_type')), ''))=UPPER(?)
            AND status IN ('pending','need_fix')
          ORDER BY id DESC LIMIT 1`,
        params
    );
    if (tempRows?.[0]) return tempRows[0];

    const [approvedRows] = await db.promise().query(
        `SELECT id, status, work_date, shift, actual_time, deduction_time, total_time,
                'approved' AS report_type
           FROM production_reports
          WHERE worker_id=? AND process_id=60006 AND work_date=? AND shift=?
            AND UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.work_type')), ''))=UPPER(?)
            AND status <> 'deleted'
          ORDER BY id DESC LIMIT 1`,
        params
    );
    return approvedRows?.[0] || null;
};

const validateManualOutputCeiling = async (req, res) => {
    const body = req.body || {};
    const mode = normalizeMode(body.operation_mode || body.execution_method);
    if (mode !== "MANUAL") return true;
    const processId = finiteNumber(body.process_id);
    const productCode = String(body.product_name || "").trim();
    const workDate = String(body.work_date || "").slice(0, 10);
    const actualTime = finiteNumber(body.actual_time);
    const enteredOk = finiteNumber(body.tt_ok);
    if (!processId || !productCode || actualTime <= 0) return true;
    const resolved = await resolveStandard({ processId, productCode, machineId: null, machineCode: null, workDate, operationMode: "MANUAL" });
    const standardOutput = finiteNumber(resolved?.standardOutput);
    if (standardOutput <= 0) return true;
    const maximumOk = standardOutput * actualTime * 2;
    if (enteredOk > maximumOk + 0.0001) {
        res.status(422).json({ success: false, code: "OUTPUT_OVER_200_PERCENT", message: "Sản lượng OK vượt 200% định mức theo thời gian thực tế", errors: { tt_ok: `OK tối đa ${Math.floor(maximumOk).toLocaleString("vi-VN")} sản phẩm (200% × ${standardOutput} sp/giờ × ${actualTime} giờ)` } });
        return false;
    }
    return true;
};

const getDuplicateConfirmationContext = (req, existingReport) => {
    const existingKey = String(existingReport?.logical_duplicate_key || "").trim();
    if (/^[a-f0-9]{64}$/i.test(existingKey)) return existingKey;

    const body = req.body || {};
    const machineLines = Array.isArray(body.machine_lines)
        ? body.machine_lines
        : Array.isArray(body.machines)
            ? body.machines.map((item) => ({
                machine_code: item?.machine_code,
                product_code: item?.product_code || item?.product_name,
            }))
            : [];

    return buildLogicalDuplicateKey({
        workerId: Number(req.user?.worker_id || body.worker_id),
        processId: Number(body.process_id),
        processCode: body.process_code || body.extra_data?.process_code,
        workDate: body.work_date,
        shift: body.shift,
        operationMode: body.operation_mode || body.execution_method,
        machineNo: body.machine_no,
        productName: body.product_name,
        machineLines,
        workType: body.work_type || body.extra_data?.work_type,
    });
};

const attachDuplicateConfirmation = (req, error) => {
    const existing = error?.existing_report || error?.details;
    if (!existing || !Number(existing.id)) return error;

    const reportType = String(existing.report_type || error?.report_type || "temp").toLowerCase() === "approved"
        ? "approved"
        : "temp";
    const logicalDuplicateKey = getDuplicateConfirmationContext(req, existing);
    const token = issueDuplicateConfirmation({
        workerId: Number(req.user?.worker_id || req.body?.worker_id),
        logicalDuplicateKey,
        existingReportId: Number(existing.id),
        existingReportType: reportType,
    });

    error.duplicate_confirmation_token = token;
    error.report_type = reportType;
    error.existing_report = existing;
    return error;
};

const createTempReport = async (req, res, next) => {
    try {
        const processId = finiteNumber(req.body?.process_id);
        const processCode = String(req.body?.process_code || req.body?.extra_data?.process_code || "").trim().toUpperCase();
        if (processId === 60006 || processCode === "CVK") {
            const existing = await findExistingCvkReport(req);
            if (existing) {
                return res.status(200).json({
                    success: true,
                    duplicate: true,
                    duplicate_reason: "logical_duplicate",
                    message: "Báo cáo đã tồn tại, tiếp tục sử dụng báo cáo hiện có.",
                    data: { id: Number(existing.id), ...existing },
                });
            }
        }
        if (!(await validateManualOutputCeiling(req, res))) return false;
        return await workerController.createTempReport(req, res, next);
    } catch (error) {
        if (String(error?.code || "") === "DUPLICATE_CONFIRMATION_REQUIRED") {
            try {
                const enriched = attachDuplicateConfirmation(req, error);
                return res.status(409).json({
                    success: false,
                    code: "DUPLICATE_CONFIRMATION_REQUIRED",
                    message: enriched.message || "Báo cáo trùng với báo cáo đã tồn tại trong cùng ngày/ca",
                    duplicate_confirmation_token: enriched.duplicate_confirmation_token,
                    report_type: enriched.report_type,
                    existing_report: enriched.existing_report,
                    data: {
                        id: Number(enriched.existing_report?.id || 0),
                        report_id: Number(enriched.existing_report?.id || 0),
                        report_type: enriched.report_type,
                        duplicate_confirmation_token: enriched.duplicate_confirmation_token,
                        created_at: enriched.existing_report?.created_at || null,
                        updated_at: enriched.existing_report?.updated_at || null,
                    },
                });
            } catch (tokenError) {
                console.error("DUPLICATE CONFIRMATION TOKEN ERROR:", tokenError);
            }
        }
        console.error("OUTPUT CEILING VALIDATION ERROR:", error);
        return res.status(error.status || 500).json({ success: false, code: error.code || "OUTPUT_CEILING_VALIDATION_FAILED", message: error.message || "Không thể kiểm tra giới hạn sản lượng" });
    }
};

const rejectSelectedReports = async (req, res) => {
    try {
        const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : Array.isArray(req.body?.targets) ? req.body.targets.map((item) => item?.id) : [];
        const ids = [...new Set(rawIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
        const reviewerId = Number(req.user?.id);
        const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
        const reason = String(req.body?.reason || "").trim();
        if (!ids.length) return res.status(400).json({ success: false, code: "INVALID_REJECT_SELECTION", message: "Vui lòng chọn ít nhất một báo cáo" });
        if (!Number.isInteger(reviewerId) || reviewerId <= 0) return res.status(401).json({ success: false, code: "INVALID_REVIEWER", message: "Thông tin người xử lý không hợp lệ" });
        if (!reason) return res.status(400).json({ success: false, code: "REJECT_REASON_REQUIRED", message: "Vui lòng nhập lý do từ chối" });
        const result = await rejectSelectedTempReports(ids, reviewerId, reason, isAdmin);
        if (typeof managementController.invalidateManagerReportLists === "function") managementController.invalidateManagerReportLists();
        return res.status(200).json({ success: true, message: result.count > 0 ? "Đã từ chối báo cáo" : "Không có báo cáo nào còn đủ điều kiện để từ chối", data: result });
    } catch (error) {
        console.error("REJECT SELECTED REPORTS ERROR:", error);
        return res.status(Number(error?.status) || 400).json({ success: false, code: error?.code || "REJECT_SELECTED_FAILED", message: error?.message || "Không thể từ chối báo cáo", details: error?.details || undefined });
    }
};

module.exports = { ...workerController, ...managementController, createTempReport, rejectSelectedReports };