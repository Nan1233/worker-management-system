const workerController = require("./productionTempWorkerController");
const managementController = require("./productionTempManagementController");
const ProductionTemp = require("../models/productionTempModel");
const { resolveStandard } = require("../services/standardResolutionService");

const normalizeMode = (value) => String(value || "").trim().toUpperCase();
const finiteNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

/**
 * Production quantity entry rule:
 * - Manual: OK <= 200% x standard/hour x actual working time.
 * - Machine: OK <= 200% x standard/hour x machine running time.
 *
 * Machine mode is already enforced by machineLineValidationService. This
 * wrapper closes the legacy/manual path, which previously had no equivalent
 * time-based 200% ceiling and could therefore disagree with the worker UI.
 */
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

    const resolved = await resolveStandard({
        processId,
        productCode,
        machineId: null,
        machineCode: null,
        workDate,
        operationMode: "MANUAL"
    });
    const standardOutput = finiteNumber(resolved?.standardOutput);
    if (standardOutput <= 0) return true;

    const maximumOk = standardOutput * actualTime * 2;
    if (enteredOk > maximumOk + 0.0001) {
        res.status(422).json({
            success: false,
            code: "OUTPUT_OVER_200_PERCENT",
            message: "Sản lượng OK vượt 200% định mức theo thời gian thực tế",
            errors: {
                tt_ok: `OK tối đa ${Math.floor(maximumOk).toLocaleString("vi-VN")} sản phẩm (200% × ${standardOutput} sp/giờ × ${actualTime} giờ)`
            }
        });
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
        return res.status(error.status || 500).json({
            success: false,
            code: error.code || "OUTPUT_CEILING_VALIDATION_FAILED",
            message: error.message || "Không thể kiểm tra giới hạn sản lượng"
        });
    }
};

// Reject is intentionally resilient to a stale manager list. A selected row
// may already have been approved/rejected or may have fallen outside the
// manager's current process scope while the page was open. Keep authorization
// enforced, reject every currently eligible selected row, and report skipped
// ids instead of failing the entire batch with a misleading 409.
const rejectSelectedReports = async (req, res, next) => {
    try {
        const rawIds = Array.isArray(req.body?.ids)
            ? req.body.ids
            : Array.isArray(req.body?.targets)
                ? req.body.targets.map((item) => item?.id)
                : [];
        const ids = [...new Set(rawIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
        const reviewerId = Number(req.user?.id);
        const isAdmin = req.user?.role === "admin";
        const reason = String(req.body?.reason || "").trim();

        if (!ids.length) return res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất một báo cáo" });
        if (!Number.isInteger(reviewerId) || reviewerId <= 0) return res.status(401).json({ success: false, message: "Thông tin người xử lý không hợp lệ" });
        if (!reason) return res.status(400).json({ success: false, message: "Vui lòng nhập lý do từ chối" });

        const eligible = [];
        const skipped = [];
        for (const id of ids) {
            const detail = await ProductionTemp.getDetail(id);
            if (!detail) {
                skipped.push({ id, reason: "not_found" });
                continue;
            }
            const status = String(detail.status || "").toLowerCase();
            if (status !== "pending" && status !== "need_fix") {
                skipped.push({ id, reason: `status_${status || "unknown"}` });
                continue;
            }
            if (!isAdmin) {
                const canManage = await ProductionTemp.canManageReport(id, reviewerId, false);
                if (!canManage) {
                    skipped.push({ id, reason: "out_of_scope" });
                    continue;
                }
            }
            eligible.push(id);
        }

        if (!eligible.length) {
            return res.status(409).json({
                success: false,
                code: "NO_ELIGIBLE_REJECT_REPORTS",
                message: "Các báo cáo đã chọn không còn ở trạng thái chờ từ chối hoặc không thuộc phạm vi phụ trách.",
                details: { requested_ids: ids, skipped }
            });
        }

        const delegatedReq = {
            ...req,
            body: { ...req.body, ids: eligible, targets: eligible.map((id) => ({ id, expected_updated_at: null })) }
        };

        try {
            return await managementController.rejectSelectedReports(delegatedReq, res, next);
        } catch (error) {
            // One final eligibility refresh handles a race where a row changes
            // between the preflight and the transactional reject operation.
            if (Number(error?.status) !== 409) throw error;
            const retryableIds = [];
            for (const id of eligible) {
                const detail = await ProductionTemp.getDetail(id);
                const status = String(detail?.status || "").toLowerCase();
                if (detail && (status === "pending" || status === "need_fix")) {
                    if (isAdmin || await ProductionTemp.canManageReport(id, reviewerId, false)) retryableIds.push(id);
                }
            }
            if (!retryableIds.length) {
                return res.status(409).json({
                    success: false,
                    code: "NO_ELIGIBLE_REJECT_REPORTS",
                    message: "Các báo cáo đã được xử lý hoặc không còn thuộc phạm vi phụ trách.",
                    details: { requested_ids: ids, skipped }
                });
            }
            const retryReq = {
                ...req,
                body: { ...req.body, ids: retryableIds, targets: retryableIds.map((id) => ({ id, expected_updated_at: null })) }
            };
            return await managementController.rejectSelectedReports(retryReq, res, next);
        }
    } catch (error) {
        console.error("REJECT SELECTED REPORTS RESILIENT ERROR:", error);
        return res.status(error.status || 400).json({
            success: false,
            code: error.code || undefined,
            message: error.message || "Không thể từ chối báo cáo",
            details: error.details || undefined
        });
    }
};

module.exports = {
    ...workerController,
    ...managementController,
    createTempReport,
    rejectSelectedReports,
};