const workerController = require("./productionTempWorkerController");
const managementController = require("./productionTempManagementController");
const ProductionTemp = require("../models/productionTempModel");
const { resolveStandard } = require("../services/standardResolutionService");
const { rejectSelectedTempReports } = require("../services/rejectSelectedTempReportsService");

const normalizeMode = (value) => String(value || "").trim().toUpperCase();
const finiteNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
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

const createTempReport = async (req, res, next) => {
    try {
        if (!(await validateManualOutputCeiling(req, res))) return;
        return workerController.createTempReport(req, res, next);
    } catch (error) {
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