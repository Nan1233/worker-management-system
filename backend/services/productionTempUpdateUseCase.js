const ProductionTemp = require("../models/productionTempModel");
const { omitUnsentCollections, preserveStoredMachineData } = require("../utils/editPayload");
const { publicMessage } = require("../utils/httpError");
const { hasPermission } = require("./permissionService");
const { assertProcessesScope } = require("./processAuthorizationService");
const { validateMachineLines } = require("./machineLineValidationService");
const { validateFactoryMachineRules } = require("./factoryMachineRuleService");
const { getProcessMachinePolicy } = require("./processMachinePolicy");
const { toPositiveInteger, validateWorkerWorkDate } = require("../utils/productionTempValidation");
const { validateMasterData } = require("./reportBusinessValidationService");
const { gcWorkTypeFromOperationType, gcWorkTypeLabel } = require("../utils/gcMachineWorkType");
const { validateProductionReport } = require("../utils/reportValidation");
const { calculateProductionOutput } = require("../../shared/productionOutput.cjs");

const updateTempReportUseCase = async ({ reportId: requestedReportId, body, user }) => {
    const req = {
        params: { id: requestedReportId },
        body: body || {},
        user
    };
    try {
        const reportId = toPositiveInteger(req.params.id);
        const changedBy = toPositiveInteger(req.user?.id);
        if (!reportId) return { status: 400, body: { success: false, message: "ID báo cáo không hợp lệ" } };

        // The payload below takes `defects`/`deductions` from the request body when it sends both arrays, so the two
        // child lists are not read in that case.
        const current = await ProductionTemp.getDetail(reportId, { skipChildRows: Array.isArray(req.body?.defects) && Array.isArray(req.body?.deductions) });
        if (!current) return { status: 404, body: { success: false, message: "Không tìm thấy báo cáo" } };

        const requiredPermission = String(req.user?.role || "").toLowerCase() === "worker"
            ? "WORKER_ENTRY"
            : "REPORT_PENDING_EDIT";
        if (!(await hasPermission(req.user, requiredPermission))) {
            return { status: 403, body: { success:false, code:"PERMISSION_DENIED", message:"Bạn không có quyền sửa báo cáo chờ duyệt" } };
        }
        if (String(req.user?.role || "").toLowerCase() === "worker") {
            if (Number(current.worker_id) !== Number(req.user?.worker_id)) {
                return { status: 403, body: { success:false, code:"WORKER_OWNERSHIP_FORBIDDEN", message:"Bạn không có quyền sửa báo cáo của công nhân khác" } };
            }
        } else {
            await assertProcessesScope(req.user, [current.process_id], { action:"REPORT_PENDING_EDIT" });
        }

        const payload = { ...current, ...(req.body || {}), defects: req.body?.defects ?? current.defects, deductions: req.body?.deductions ?? current.deductions };

        if (req.user?.role === "worker") {
            const workDateError = validateWorkerWorkDate(payload.work_date);
            if (workDateError) {
                return { status: 422, body: { success: false, message: workDateError } };
            }
        }

        const validation = validateProductionReport(payload, { enforceBackDate: false });
        if (!validation.valid) return { status: 422, body: { success: false, message: "Dữ liệu báo cáo không hợp lệ", errors: validation.errors } };
        const operationType = String(req.body?.operation_type || payload?.operation_type || "").trim().toUpperCase() || null;
        const operationMode = String(req.body?.operation_mode || req.body?.execution_method || payload?.operation_mode || "").trim().toUpperCase() || null;
        const machinePolicy = getProcessMachinePolicy(current.process_id);
        const rawMachineLines = operationMode === "MANUAL"
            ? []
            : Array.isArray(req.body?.machine_lines)
                ? req.body.machine_lines
                : current.machine_lines || [];
        const normalizedMachineNo = String(validation.normalized.machine_no || payload?.machine_no || "").trim();

        if (machinePolicy.mode === "MANUAL_ONLY" && (operationMode === "MACHINE" || rawMachineLines.length || normalizedMachineNo)) {
            return { status: 422, body: { success: false, message: "Công đoạn này chỉ thực hiện bằng tay", errors: { machine_no: "Không được chọn máy" } } };
        }
        if (machinePolicy.mode === "MULTI_MACHINE_REQUIRED" && rawMachineLines.length === 0) {
            return { status: 422, body: { success: false, message: "Công đoạn này bắt buộc nhập danh sách máy", errors: { machine_lines: "Vui lòng chọn từ 1 đến 4 máy" } } };
        }
        if (machinePolicy.mode === "SINGLE_MACHINE_REQUIRED" && ((!normalizedMachineNo && rawMachineLines.length === 0) || rawMachineLines.length > 1)) {
            const label = machinePolicy.code === "DO" ? "Đo" : machinePolicy.code === "EP" ? "Ép" : "Cán";
            return { status: 422, body: { success: false, message: `Công đoạn ${label} yêu cầu đúng một máy`, errors: { machine_no: `Vui lòng chọn đúng một máy ${label.toLowerCase()}` } } };
        }
        if (machinePolicy.mode === "MANUAL_OR_SINGLE_MACHINE" && rawMachineLines.length > 1) {
            return { status: 422, body: { success: false, message: "Công đoạn Kiểm chỉ được chọn tối đa một máy", errors: { machine_lines: "Chỉ được chọn một máy hoặc làm tay" } } };
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
            return { status: 422, body: {
                success: false,
                message: "Thông tin máy hoặc thời gian máy không hợp lệ",
                errors: machineValidation.errors
            } };
        }
        const editFactoryRules = await validateFactoryMachineRules({
            processCode: machinePolicy.code,
            processId: current.process_id,
            machineLines: machineValidation.lines.length
                ? machineValidation.lines
                : (normalizedMachineNo ? [{ machine_code: normalizedMachineNo }] : [])
        });
        if (!editFactoryRules.valid) {
            return { status: 422, body: { success: false, message: "Cách sử dụng máy không đúng quy tắc thực tế tại xưởng", errors: editFactoryRules.errors } };
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
            allowEmptyMachine: operationMode === "MANUAL" || machinePolicy.mode === "MANUAL_ONLY",
            operationType: validation.normalized.operation_type ?? payload.operation_type,
            workDate: payload.work_date,
            reuseValidatedMachine,
            knownProcessCode: current.process_code || null,
            // Existing manager-scoped reports remain editable even if the worker's assignment
            // changed after submission; report ownership and manager process scope were checked above.
            skipWorkerProcessAssignment: String(req.user?.role || "").toLowerCase() !== "worker"
        });
        if (!master.valid) return { status: 422, body: { success: false, message: "Dữ liệu danh mục không hợp lệ", errors: master.errors } };

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
            machine_lines: machineValidation.lines
        };

        const result = await ProductionTemp.updateReport(
            reportId,
            omitUnsentCollections(req.body, preserveStoredMachineData(req.body, normalizedUpdate)),
            changedBy,
            req.body?.reason || null,
            {
                isAdmin: req.user?.role === "admin",
                workerId: req.user?.role === "worker" ? req.user?.worker_id : null,
                expectedUpdatedAt: req.body?.expected_updated_at || null,
                // Same-request facts that spare the model repeated master-data reads (Worker subrequest budget).
                processCode: current.process_code || undefined,
                machineLinesValidated: true
            }
        );

        return { status: 200, body: {
            success: true,
            message: result.changed ? "Cập nhật báo cáo thành công" : "Không có dữ liệu thay đổi",
            data: result
        } };
    } catch (error) {
        console.error("UPDATE TEMP REPORT ERROR:", error);
        if (/too many subrequests/i.test(String(error?.message || ""))) {
            // Cloudflare Worker budget exhausted mid-request. Normally COMMIT never ran (the open transaction is
            // discarded), but if the limit hit at COMMIT the outcome is unknown, so the message asks for a reload
            // (the optimistic version check then prevents a duplicate write) and is not presented as a validation error.
            return { status: 503, body: { success: false, code: "DB_SUBREQUEST_LIMIT_EXCEEDED", message: "Hệ thống đang quá tải truy vấn nên chưa xác nhận được việc lưu thay đổi. Vui lòng tải lại báo cáo để kiểm tra rồi thử lại." } };
        }
        return { status: error.status || 400, body: { success: false, code: error.code || undefined, message: publicMessage(error, "Không thể cập nhật báo cáo") } };
    }
};

module.exports = { updateTempReportUseCase };
