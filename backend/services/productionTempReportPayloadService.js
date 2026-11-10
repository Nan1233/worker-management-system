const { calculateProductionOutput } = require("../../shared/productionOutput.cjs");
const { buildLogicalDuplicateKey } = require("./logicalDuplicateReportService");
const { normalizeOperationType, normalizeOperationMode } = require("../controllers/productionTempControllerUtils");

/** Builds the persisted payload after business and master-data validation. */
function buildProductionTempReportPayload({ requestBody, validation, machineValidation, masterValidation, extraDataInput, workerId, processId, operationMode, clientRequestId }) {
        const manualOutput = machineValidation.lines.length
            ? null
            : calculateProductionOutput({
                ok: validation.normalized.tt_ok,
                defects: masterValidation.authoritativeDefects
            });

        const data = {
            ...validation.normalized,

            // work_date là ngày công nhân chọn; entry_date là ngày thực tế nhập báo cáo.
            entry_date: String(requestBody?.entry_date || new Date().toISOString().slice(0, 10)).slice(0, 10),
            extra_data: extraDataInput,

            worker_id:
                workerId,

            process_id: processId,
            operation_type: normalizeOperationType(
                validation?.normalized?.operation_type ??
                requestBody?.operation_type ??
                requestBody?.operationType
            ),
            operation_mode: normalizeOperationMode(
                validation?.normalized?.operation_mode ??
                requestBody?.operation_mode ??
                requestBody?.operationMode
            ),

            machine_no:
                machineValidation.lines.length
                    ? machineValidation.lines.map((line) => line.machine_code).join(", ")
                    : operationMode === "MANUAL"
                        ? null
                        : masterValidation.machineCode,

            product_name:
                machineValidation.lines.length
                    ? [...new Set(machineValidation.lines.map((line) => line.product_code))].join(", ")
                    : masterValidation.productCode,

            // Báo cáo nhiều máy không dùng định mức của máy đầu tiên.
            // Cột legacy standard_output chỉ giữ tốc độ bình quân có trọng số theo giờ máy.
            standard_output:
                machineValidation.lines.length
                    ? (Number(machineValidation.totals?.totalMachineHours || 0) > 0
                        ? Number(machineValidation.totals.totalMaximum || 0) / Number(machineValidation.totals.totalMachineHours)
                        : 0)
                    : masterValidation.standardOutput,
            // Parent multi-machine can aggregate multiple products/standards; identity is stored per line.
            standard_version_id: machineValidation.lines.length ? null : masterValidation.standardVersionId,
            machine_standard_id: machineValidation.lines.length ? null : masterValidation.machineStandardId,

            // Với báo cáo máy, actual_output là sản lượng OK cộng toàn bộ NG.
            actual_output:
                machineValidation.lines.length
                    ? Number(machineValidation.totals?.totalCounted || 0)
                    : Number(manualOutput.actualOutput),
            tt_ok:
                machineValidation.lines.length
                    ? Number(machineValidation.totals?.totalOk || 0)
                    : validation.normalized.tt_ok,
            tt_ng:
                machineValidation.lines.length
                    ? Number(machineValidation.totals?.totalNg || 0)
                    : validation.normalized.tt_ng,

            defects:
                undefined,

            deductions:
                undefined,

            client_request_id: clientRequestId,

            force_create:
                requestBody?.force_create === true,
            duplicate_confirmation_token:
                String(requestBody?.duplicate_confirmation_token || "").trim() || null
        };

        data.logical_duplicate_key = buildLogicalDuplicateKey({
            workerId,
            processId,
            workDate: data.work_date,
            shift: data.shift,
            operationMode: data.operation_mode,
            machineNo: data.machine_no,
            productName: data.product_name,
            machineLines: machineValidation.lines
        });

        return data;
}

module.exports = { buildProductionTempReportPayload };
