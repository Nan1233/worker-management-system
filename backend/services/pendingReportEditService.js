'use strict';
const ProductionTemp = require('../models/productionTempModel');
const { omitUnsentCollections, preserveStoredMachineData } = require('../utils/editPayload');
const { hasPermission } = require('./permissionService');
const { assertProcessesScope } = require('./processAuthorizationService');
const { validateMachineLines } = require('./machineLineValidationService');
const { validateFactoryMachineRules } = require('./factoryMachineRuleService');
const { getProcessMachinePolicy } = require('./processMachinePolicy');
const { validateProcessExtraData } = require('./processExtraDataValidationService');
const { validateMasterData } = require('./reportBusinessValidationService');
const { gcWorkTypeFromOperationType, gcWorkTypeLabel } = require('../utils/gcMachineWorkType');
const { validateProductionReport } = require('../utils/reportValidation');
const { calculateProductionOutput } = require('../../shared/productionOutput.cjs');
const { validateWorkerWorkDate } = require('../domain/workerWorkDatePolicy');
const { toPositiveInteger } = require('../utils/positiveInteger');

function pendingEditError(status, payload) {
    return Object.assign(new Error(payload.message), {status, code:payload.code, isPublic:true, responseBody:payload});
}

async function editPendingReport({ id, actor, body, transactionConnection }) {
        const reportId = toPositiveInteger(id);
        const changedBy = toPositiveInteger(actor?.id);
        if (!reportId) throw pendingEditError(400, { success: false, message: "ID báo cáo không hợp lệ" });

        // The payload below takes `defects`/`deductions` from the request body when it sends both arrays, so the two
        // child lists are not read in that case.
        const current = await ProductionTemp.getDetail(reportId, { skipChildRows: Array.isArray(body?.defects) && Array.isArray(body?.deductions) });
        if (!current) throw pendingEditError(404, { success: false, message: "Không tìm thấy báo cáo" });

        const requiredPermission = String(actor?.role || "").toLowerCase() === "worker"
            ? "WORKER_ENTRY"
            : "REPORT_PENDING_EDIT";
        if (!(await hasPermission(actor, requiredPermission))) {
            throw pendingEditError(403, { success:false, code:"PERMISSION_DENIED", message:"Bạn không có quyền sửa báo cáo chờ duyệt" });
        }
        if (String(actor?.role || "").toLowerCase() === "worker") {
            if (Number(current.worker_id) !== Number(actor?.worker_id)) {
                throw pendingEditError(403, { success:false, code:"WORKER_OWNERSHIP_FORBIDDEN", message:"Bạn không có quyền sửa báo cáo của công nhân khác" });
            }
        } else {
            await assertProcessesScope(actor, [current.process_id], { action:"REPORT_PENDING_EDIT" });
        }

        const payload = { ...current, ...(body || {}), defects: body?.defects ?? current.defects, deductions: body?.deductions ?? current.deductions };
        const hasExtraDataUpdate = Object.prototype.hasOwnProperty.call(body || {}, "extra_data");
        if (hasExtraDataUpdate) {
            const extraDataValidation = await validateProcessExtraData({
                processCode: current.process_code || getProcessMachinePolicy(current.process_id).code,
                extraData: payload.extra_data
            });
            if (!extraDataValidation.valid) {
                throw pendingEditError(422, {
                    success: false,
                    message: "Thông tin riêng công đoạn không hợp lệ",
                    errors: extraDataValidation.errors
                });
            }
            payload.extra_data = extraDataValidation.extraData;
        }

        if (actor?.role === "worker") {
            const workDateError = validateWorkerWorkDate(payload.work_date);
            if (workDateError) {
                throw pendingEditError(422, { success: false, message: workDateError });
            }
        }

        const validation = validateProductionReport(payload, { enforceBackDate: false });
        if (!validation.valid) throw pendingEditError(422, { success: false, message: "Dữ liệu báo cáo không hợp lệ", errors: validation.errors });
        const operationType = String(body?.operation_type || payload?.operation_type || "").trim().toUpperCase() || null;
        const operationMode = String(body?.operation_mode || body?.execution_method || payload?.operation_mode || "").trim().toUpperCase() || null;
        const machinePolicy = getProcessMachinePolicy(current.process_id);
        const rawMachineLines = operationMode === "MANUAL"
            ? []
            : Array.isArray(body?.machine_lines)
                ? body.machine_lines
                : current.machine_lines || [];
        const normalizedMachineNo = String(validation.normalized.machine_no || payload?.machine_no || "").trim();

        if (machinePolicy.mode === "MANUAL_ONLY" && (operationMode === "MACHINE" || rawMachineLines.length || normalizedMachineNo)) {
            throw pendingEditError(422, { success: false, message: "Công đoạn này chỉ thực hiện bằng tay", errors: { machine_no: "Không được chọn máy" } });
        }
        if (machinePolicy.mode === "MULTI_MACHINE_REQUIRED" && rawMachineLines.length === 0) {
            throw pendingEditError(422, { success: false, message: "Công đoạn này bắt buộc nhập danh sách máy", errors: { machine_lines: "Vui lòng chọn từ 1 đến 4 máy" } });
        }
        if (["SINGLE_MACHINE_REQUIRED", "SINGLE_MACHINE_OPTIONAL"].includes(machinePolicy.mode)
            && ((machinePolicy.mode === "SINGLE_MACHINE_REQUIRED" && !normalizedMachineNo && rawMachineLines.length === 0) || rawMachineLines.length > 1)) {
            const label = machinePolicy.code === "DO" ? "Đo" : machinePolicy.code === "EP" ? "Ép" : "Cán";
            throw pendingEditError(422, { success: false, message: `Công đoạn ${label} chỉ được ghi nhận tối đa một máy`, errors: { machine_no: `Chỉ được chọn tối đa một máy ${label.toLowerCase()}` } });
        }
        if (machinePolicy.mode === "MANUAL_OR_SINGLE_MACHINE" && rawMachineLines.length > 1) {
            throw pendingEditError(422, { success: false, message: "Công đoạn Kiểm chỉ được chọn tối đa một máy", errors: { machine_lines: "Chỉ được chọn một máy hoặc làm tay" } });
        }

        const machineValidation = await validateMachineLines({
            processId: current.process_id,
            machineLines: rawMachineLines,
            operationType,
            operationMode: operationMode || (rawMachineLines.length ? "MACHINE" : "MANUAL"),
            maxMachines: machinePolicy.maxMachines || 4,
            workDate: payload.work_date
        });
        if (!machineValidation.valid) {
            throw pendingEditError(422, {
                success: false,
                message: "Thông tin máy hoặc thời gian máy không hợp lệ",
                errors: machineValidation.errors
            });
        }
        const editFactoryRules = await validateFactoryMachineRules({
            processCode: machinePolicy.code,
            processId: current.process_id,
            machineLines: machineValidation.lines.length
                ? machineValidation.lines
                : (normalizedMachineNo ? [{ machine_code: normalizedMachineNo }] : [])
        });
        if (!editFactoryRules.valid) {
            throw pendingEditError(422, { success: false, message: "Cách sử dụng máy không đúng quy tắc thực tế tại xưởng", errors: editFactoryRules.errors });
        }
        // Capacity is checked again under the transaction's worker/machine locks by updateReport().
        // Do not issue an unlocked preflight query here: it is both racy (another request can claim the
        // machine immediately after this check) and duplicates the authoritative locked check.
        const firstLine = machineValidation.lines[0] || null;
        // validateMachineLines already proved, for the first line, the same facts validateMasterData re-derives with
        // 7 more queries (machine in process, product + standard on the work date, GC work type). That re-check is only
        // redundant when no explicit Cắt/Lồng choice could contradict the machine's own type; a differing explicit
        // choice must still reach the resolver so GC_WORK_TYPE_MISMATCH is raised exactly as before.
        const explicitGcWorkType = machinePolicy.code === "GC" ? gcWorkTypeFromOperationType(operationType) : null;
        const validatedMachineType = machineValidation.firstMachine ? gcWorkTypeLabel(machineValidation.firstMachine.gc_work_type) : null;
        const reuseValidatedMachine = firstLine && machineValidation.firstMachine
            && !["CVK"].includes(machinePolicy.code) && ![30002, 60006].includes(Number(current.process_id))
            && (!explicitGcWorkType || (validatedMachineType && explicitGcWorkType === validatedMachineType))
            ? { machineCode: firstLine.machine_code, productCode: firstLine.product_code }
            : null;
        const master = await validateMasterData({
            workerId: current.worker_id,
            processId: current.process_id,
            machineNo: firstLine?.machine_code || validation.normalized.machine_no,
            productName: firstLine?.product_code || validation.normalized.product_name,
            defects: validation.normalized.defects,
            deductions: validation.normalized.deductions,
            ttOk: operationMode === "MANUAL" ? validation.normalized.tt_ok : undefined,
            actualOutput: operationMode === "MANUAL" ? validation.normalized.actual_output : undefined,
            allowEmptyMachine: operationMode === "MANUAL" || machinePolicy.mode === "MANUAL_ONLY" || (["MAI", "DO"].includes(machinePolicy.code) && rawMachineLines.length === 0 && !normalizedMachineNo),
            operationType: validation.normalized.operation_type ?? payload.operation_type,
            workDate: payload.work_date,
            reuseValidatedMachine,
            knownProcessCode: current.process_code || null,
            // Existing manager-scoped reports remain editable even if the worker's assignment
            // changed after submission; report ownership and manager process scope were checked above.
            skipWorkerProcessAssignment: String(actor?.role || "").toLowerCase() !== "worker"
        });
        if (!master.valid) throw pendingEditError(422, { success: false, message: "Dữ liệu danh mục không hợp lệ", errors: master.errors });

        const hasMachineLines = machineValidation.lines.length > 0;
        const totalMachineHours = Number(machineValidation.totals?.totalMachineHours || 0);
        const manualOutput = hasMachineLines ? null : calculateProductionOutput({
            ok: validation.normalized.tt_ok,
            defects: master.authoritativeDefects
        });
        const normalizedUpdate = {
            ...validation.normalized,
            operation_mode: (hasMachineLines || (operationMode === "MACHINE" && master.machineCode)) ? "MACHINE" : "MANUAL",
            machine_no: hasMachineLines
                ? machineValidation.lines.map((line) => line.machine_code).join(", ")
                : (operationMode === "MACHINE" ? master.machineCode : null),
            product_name: hasMachineLines
                ? [...new Set(machineValidation.lines.map((line) => line.product_code))].join(", ")
                : master.productCode,
            standard_output: hasMachineLines
                ? (totalMachineHours > 0
                    ? Number(machineValidation.totals?.totalMaximum || 0) / totalMachineHours
                    : 0)
                : master.standardOutput,
            actual_output: hasMachineLines
                ? Number(machineValidation.totals?.totalCounted || 0)
                : Number(manualOutput.actualOutput),
            tt_ok: hasMachineLines
                ? Number(machineValidation.totals?.totalOk || 0)
                : validation.normalized.tt_ok,
            tt_ng: hasMachineLines
                ? Number(machineValidation.totals?.totalNg || 0)
                : validation.normalized.tt_ng,
            standard_version_id: hasMachineLines ? null : master.standardVersionId,
            machine_standard_id: hasMachineLines ? null : master.machineStandardId,
            machine_lines: machineValidation.lines,
            ...(hasExtraDataUpdate ? { extra_data: payload.extra_data } : {})
        };

        const result = await ProductionTemp.updateReport(
            reportId,
            omitUnsentCollections(body, preserveStoredMachineData(body, normalizedUpdate)),
            changedBy,
            body?.reason || null,
            {
                isAdmin: actor?.role === "admin",
                workerId: actor?.role === "worker" ? actor?.worker_id : null,
                expectedUpdatedAt: body?.expected_updated_at || null,
                // Same-request facts that spare the model repeated master-data reads (Worker subrequest budget).
                processCode: current.process_code || undefined,
                machineLinesValidated: true,
                ...(transactionConnection ? { connection: transactionConnection } : {})
            }
        );


    return result;
}
module.exports = { editPendingReport };
