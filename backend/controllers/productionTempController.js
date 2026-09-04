const workerController = require("./productionTempWorkerController");
const managementController = require("./productionTempManagementController");
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

    // Let the canonical validators handle missing/invalid master data and time.
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

module.exports = {
    ...workerController,
    ...managementController,
    createTempReport
};
