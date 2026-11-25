'use strict';
const ProductionTemp=require('../models/productionTempModel');
const {publicMessage}=require('../utils/httpError');
const {toPositiveInteger}=require('../utils/positiveInteger');
const {validateWorkerWorkDate}=require('../domain/workerWorkDatePolicy');
const {validateMachineLines}=require('./machineLineValidationService');
const {getProcessMachinePolicy}=require('./processMachinePolicy');
const {validateProcessExtraData}=require('./processExtraDataValidationService');
const {validateFactoryMachineRules}=require('./factoryMachineRuleService');
const {validateMasterData}=require('./reportBusinessValidationService');
const {validateProductionReport,isImplicitGcNonProductWork}=require('../utils/reportValidation');
const {queuePostCreateSideEffects}=require('./productionReportSideEffectsService');
const {issueDuplicateConfirmation}=require('./duplicateConfirmationService');
const {buildProductionTempReportPayload}=require('./productionTempReportPayloadService');
async function submitWorkerReport({actor,body,auditMeta}) {
    let data = null;
    try {
        const workerId =
            toPositiveInteger(
                actor?.worker_id
            );

        const processId =
            toPositiveInteger(
                body?.process_id
            );

        let extraDataInput = body?.extra_data && typeof body.extra_data === "object" && !Array.isArray(body.extra_data)
            ? { ...body.extra_data }
            : {};
        const implicitGcNonProductWork = isImplicitGcNonProductWork(body);
        const isNonProductWorkWithinProcess = (extraDataInput.non_product_work === true || implicitGcNonProductWork)
            && processId !== 30002 && processId !== 60006;
        // Persist the effective classification used by report validation and the
        // master-data check. A valid Xuất nhập/KTCD/TAIPP entry may omit the flag.
        if (implicitGcNonProductWork) extraDataInput.non_product_work = true;


        if (!workerId) {
            return {status:400,payload:{
                success: false,
                message:
                    "Tài khoản chưa có thông tin nhân viên"
            }};
        }


        if (!processId) {
            return {status:400,payload:{
                success: false,
                message:
                    "Công đoạn không hợp lệ"
            }};
        }


        if (!body.work_date) {
            return {status:400,payload:{
                success: false,
                message:
                    "Thiếu ngày làm việc"
            }};
        }


        const workDateError = validateWorkerWorkDate(body.work_date);
        if (workDateError) {
            return {status:422,payload:{
                success: false,
                message: workDateError
            }};
        }


        if (!body.shift) {
            return {status:400,payload:{
                success: false,
                message:
                    "Thiếu ca làm việc"
            }};
        }

        // client_request_id là khóa idempotency do client sinh ra và phải được
        // tái sử dụng khi retry cùng một lần gửi. DB có UNIQUE(worker_id, client_request_id).
        const clientRequestId = String(body?.client_request_id || "").trim();
        if (!clientRequestId || clientRequestId.length > 64) {
            return {status:400,payload:{
                success: false,
                code: "CLIENT_REQUEST_ID_REQUIRED",
                message: "Thiếu mã yêu cầu gửi báo cáo. Vui lòng tải lại biểu mẫu và gửi lại."
            }};
        }


        // =================================================
        // VALIDATE DỮ LIỆU NGHIỆP VỤ
        // =================================================

        const validation =
            validateProductionReport(
                body,
                { skipActualOutputFormula: true }
            );


        if (!validation.valid) {
            return {status:422,payload:{
                success: false,
                message:
                    "Dữ liệu báo cáo không hợp lệ",
                errors:
                    validation.errors
            }};
        }


        const defects =
            validation.normalized.defects;

        const deductions =
            validation.normalized.deductions;

        // Thời gian công nhân vẫn dùng total_time / actual_time hiện có.
        // machine_lines chỉ lưu thời gian chạy riêng của từng máy.
        const operationType = String(body?.operation_type || "").trim().toUpperCase() || null;
        const operationMode = String(body?.operation_mode || body?.execution_method || "").trim().toUpperCase() || null;
        const submittedMachineLines = Array.isArray(body?.machine_lines)
            ? body.machine_lines
            : Array.isArray(body?.machines)
                ? body.machines.map((item) => ({
                    machine_code: item.machine_code,
                    product_code: item.product_code || validation.normalized.product_name,
                    machine_time_hours: item.machine_time_hours ??
                        ((Number(item.running_hours || 0) * 60 + Number(item.running_minutes || 0)) / 60),
                    ok_quantity: item.ok_quantity ?? item.okQuantity ?? 0,
                    ng_quantity: item.ng_quantity ?? item.ngQuantity ?? 0
                }))
                : [];

        // Accept both API snake_case and frontend camelCase quantity keys.
        // Nullish fallback is intentional: a valid numeric 0 must remain 0,
        // while a missing snake_case key can still use the camelCase value.
        const rawMachineLines = submittedMachineLines.map((line) => ({
            ...line,
            ok_quantity: line?.ok_quantity ?? line?.okQuantity ?? 0,
            ng_quantity: line?.ng_quantity ?? line?.ngQuantity ?? 0
        }));

        const machinePolicy = getProcessMachinePolicy(processId);
        const extraDataValidation = await validateProcessExtraData({ processCode: machinePolicy.code, extraData: extraDataInput });
        if (!extraDataValidation.valid) {
            return {status:422,payload:{
                success: false,
                message: "Thông tin riêng công đoạn không hợp lệ",
                errors: extraDataValidation.errors
            }};
        }
        extraDataInput = extraDataValidation.extraData;
        const normalizedMachineNo = String(validation.normalized.machine_no || body?.machine_no || "").trim();
        const requestedMachineMode = operationMode === "MACHINE" || rawMachineLines.length > 0 || Boolean(normalizedMachineNo);

        if (!isNonProductWorkWithinProcess && machinePolicy.mode === "MANUAL_ONLY" && requestedMachineMode) {
            return {status:422,payload:{
                success: false,
                message: "Công đoạn này chỉ thực hiện bằng tay",
                errors: { machine_no: "Không được chọn máy cho công đoạn này" }
            }};
        }

        if (!isNonProductWorkWithinProcess && machinePolicy.mode === "MULTI_MACHINE_REQUIRED" && rawMachineLines.length === 0) {
            return {status:422,payload:{
                success: false,
                message: "Công đoạn này bắt buộc nhập danh sách máy",
                errors: { machine_lines: "Vui lòng chọn từ 1 đến 4 máy và nhập dữ liệu riêng từng máy" }
            }};
        }

        if (!isNonProductWorkWithinProcess && ["SINGLE_MACHINE_REQUIRED", "SINGLE_MACHINE_OPTIONAL"].includes(machinePolicy.mode)
            && (machinePolicy.mode === "SINGLE_MACHINE_REQUIRED" && !normalizedMachineNo && rawMachineLines.length === 0 || rawMachineLines.length > 1)) {
            const label = machinePolicy.code === "DO" ? "Đo" : machinePolicy.code === "EP" ? "Ép" : "Cán";
            return {status:422,payload:{
                success: false,
                message: `Công đoạn ${label} chỉ được ghi nhận tối đa một máy`,
                errors: { machine_no: `Chỉ được chọn tối đa một máy ${label.toLowerCase()}` }
            }};
        }

        if (!isNonProductWorkWithinProcess && machinePolicy.mode === "MANUAL_OR_SINGLE_MACHINE" && rawMachineLines.length > 1) {
            return {status:422,payload:{
                success: false,
                message: "Công đoạn Kiểm chỉ được chọn tối đa một máy",
                errors: { machine_lines: "Chỉ được chọn một máy hoặc chuyển sang làm tay" }
            }};
        }

        let machineValidation = { valid: true, lines: [], totals: null, errors: {} };
        if (rawMachineLines.length > 0) {
            machineValidation = await validateMachineLines({
                processId,
                machineLines: rawMachineLines,
                operationType,
                operationMode: "MACHINE",
                maxMachines: machinePolicy.maxMachines || 4,
                allowZeroQuantity: isNonProductWorkWithinProcess || machinePolicy.code === "CVK",
                workDate: body.work_date
            });
            if (!machineValidation.valid) {
                return {status:422,payload:{
                    success: false,
                    message: "Thông tin máy hoặc thời gian máy không hợp lệ",
                    errors: machineValidation.errors
                }};
            }
        } else if (!isNonProductWorkWithinProcess && !["MAI", "DO"].includes(machinePolicy.code) && operationMode === "MACHINE" && !normalizedMachineNo) {
            return {status:422,payload:{
                success: false,
                message: "Vui lòng chọn máy",
                errors: { machine_no: "Máy không được để trống" }
            }};
        }

        const factoryRuleValidation = isNonProductWorkWithinProcess ? { valid: true, errors: {} } : await validateFactoryMachineRules({
            processCode: machinePolicy.code,
            processId,
            machineLines: machineValidation.lines.length
                ? machineValidation.lines
                : (normalizedMachineNo ? [{ machine_code: normalizedMachineNo }] : [])
        });
        if (!factoryRuleValidation.valid) {
            return {status:422,payload:{
                success: false,
                message: "Cách sử dụng máy không đúng quy tắc thực tế tại xưởng",
                errors: factoryRuleValidation.errors
            }};
        }
        // Machine-worker capacity is checked again under the submission transaction
        // after capacity keys are locked. Do not run the same two-query check here:
        // it spends Worker subrequests and can race before the authoritative lock.


        // =================================================
        // KIỂM TRA DANH MỤC MÁY, SẢN PHẨM, NG, TRỪ GIỜ
        // =================================================

        const firstMachineLine = machineValidation.lines[0] || null;
        const masterValidation =
            await validateMasterData({
                workerId,
                processId,

                machineNo:
                    firstMachineLine?.machine_code || validation.normalized.machine_no,

                productName:
                    firstMachineLine?.product_code || validation.normalized.product_name,

                defects,
                deductions,
                ttOk: validation.normalized.tt_ok,
                actualOutput: validation.normalized.actual_output,
                // Machine-line reports validate each line's OK/NG/output in validateMachineLines.
                // Do not compare aggregate output against only the first machine's defects.
                skipActualOutputValidation: Array.isArray(machineValidation.lines) && machineValidation.lines.length > 0,
                allowEmptyMachine: operationMode === "MANUAL" || machinePolicy.mode === "MANUAL_ONLY" || (["MAI", "DO"].includes(machinePolicy.code) && rawMachineLines.length === 0 && !normalizedMachineNo),
                operationMode,
                operationType: validation.normalized.operation_type ?? body.operation_type,
                workDate: body.work_date,
                workType: body.work_type || extraDataInput.work_type,
                nonProductWork: isNonProductWorkWithinProcess
            });


        if (!masterValidation.valid) {
            return {status:422,payload:{
                success: false,
                message:
                    "Dữ liệu không khớp danh mục hệ thống",
                errors:
                    masterValidation.errors
            }};
        }


        data = buildProductionTempReportPayload({
            requestBody: body, validation, machineValidation, masterValidation,
            extraDataInput, workerId, processId, operationMode, clientRequestId
        });

        // =================================================
        // LƯU BÁO CÁO
        // Chỉ khai báo result đúng 1 lần
        // =================================================

        const result =
            await ProductionTemp
                .createCompleteReport({
                    data,
                    defects,
                    deductions,
                    machineLines: machineValidation.lines,
                    audit: {
                        userId: actor?.id,
                        note: "Công nhân tạo báo cáo",
                        description: "Công nhân tạo báo cáo sản xuất chờ duyệt",
                        ...auditMeta
                    }
                });


        queuePostCreateSideEffects({
            result,
            workerId,
            processId,
            data
        });

        return {status:result.duplicate?200:201,payload:{
                success: true,

                duplicate:
                    result.duplicate,

                duplicate_reason:
                    result.duplicate_reason || null,

                message:
                    result.duplicate
                        ? "Yêu cầu này đã được ghi nhận trước đó"
                        : "Lưu báo cáo thành công",

                id:
                    result.id,

                // Existing clients continue using id; newer clients can consume every per-machine report.
                ids:
                    Array.isArray(result.ids) ? result.ids : (result.id ? [result.id] : []),

                reports:
                    Array.isArray(result.reports) ? result.reports : [],

                data:
                    result.existing_report || null
            }};
    } catch (error) {
        console.error(
            "CREATE TEMP REPORT ERROR:",
            error
        );

        if (error.code === "DUPLICATE_PRODUCTION_REPORT" || error.code === "DUPLICATE_CONFIRMATION_REQUIRED") {
            const existing = error.existing_report || null;
            let duplicateConfirmationToken = null;
            if (existing?.id && data?.logical_duplicate_key) {
                duplicateConfirmationToken = issueDuplicateConfirmation({
                    workerId: data.worker_id,
                    logicalDuplicateKey: data.logical_duplicate_key,
                    existingReportId: existing.id,
                    existingReportType: existing.report_type || 'temp',
                });
            }
            return {status:409,payload:{
                success: false,
                code: error.code === "DUPLICATE_CONFIRMATION_REQUIRED" ? error.code : "DUPLICATE_PRODUCTION_REPORT",
                duplicate: true,
                duplicate_reason: "similar_report",
                duplicate_confirmation_token: duplicateConfirmationToken,
                data: existing,
                message: publicMessage(error, "Đã tồn tại báo cáo cùng công nhân/ngày/ca/máy/sản phẩm")
            }};
        }
        return {status:error.status || 500,payload:{
            success: false,
            code: error.code || undefined,
            message: publicMessage(error, "Không thể tạo báo cáo")
        }};
    }
}
module.exports={submitWorkerReport};
