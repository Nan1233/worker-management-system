'use strict';
const ProductionTemp=require('../models/productionTempModel');
const {toPositiveInteger}=require('../utils/positiveInteger');
const {normalizeOperationType,normalizeOperationMode}=require('../domain/operationNormalization');
const {validateWorkerWorkDate}=require('../domain/workerWorkDatePolicy');
const {validateMasterData}=require('./reportBusinessValidationService');
async function checkSimilarReport({actor,body}) {
        const workerId = toPositiveInteger(actor?.worker_id);
        const processId = toPositiveInteger(body?.process_id);
        const workDate = String(body?.work_date || "").trim();
        const shift = String(body?.shift || "").trim();
        const machineNo = String(body?.machine_no || "").trim();
        const productName = String(body?.product_name || "").trim();
        // Optional, backward-compatible: the queued report's own mode lets this check apply
        // the same standard-resolution rule as createTempReport. Absent -> legacy inference.
        const operationMode = normalizeOperationMode(body?.operation_mode);
        const workType = String(body?.work_type || "").trim().slice(0, 40) || null;

        if (!workerId || !processId || !workDate || !shift || !machineNo || !productName) {
            return {status:400,payload:{ success: false, message: "Thiếu thông tin kiểm tra báo cáo trùng" }};
        }

        const workDateError = validateWorkerWorkDate(workDate);
        if (workDateError) {
            return {status:422,payload:{ success: false, message: workDateError }};
        }

        // The frontend duplicate-check request historically sends the aggregate display
        // fields (machine_no/product_name), while the final submit also sends machine_lines.
        // Reconstruct aligned MAI pairs for this backward-compatible preflight path.
        const submittedLines = Array.isArray(body?.machine_lines) && body.machine_lines.length
            ? body.machine_lines
            : (Number(processId) === 2 && operationMode === "MACHINE"
                ? (() => {
                    const machines = machineNo.split(",").map((value) => value.trim()).filter(Boolean);
                    const products = productName.split(",").map((value) => value.trim()).filter(Boolean);
                    if (machines.length < 2 || machines.length !== products.length) return [];
                    return machines.map((machine_code, index) => ({
                        machine_code,
                        product_code: products[index]
                    }));
                })()
                : []);
        const isMaiMachineGroup = Number(processId) === 2
            && submittedLines.length > 1
            && operationMode === "MACHINE";

        let report = null;
        if (isMaiMachineGroup) {
            // Mài multi-machine payloads carry a display-only comma-separated parent product_name.
            // Resolve each actual machine/product pair independently; never ask the standard resolver
            // to find one historical standard for the aggregate display string.
            for (const [index, line] of submittedLines.entries()) {
                const lineMachine = String(line?.machine_code || "").trim();
                const lineProduct = String(line?.product_code || "").trim();
                const masterValidation = await validateMasterData({
                    workerId, processId, machineNo: lineMachine, productName: lineProduct,
                    defects: [], deductions: [], workDate, operationMode: "MACHINE",
                    operationType: normalizeOperationType(body?.operation_type), workType
                });
                if (!masterValidation.valid) {
                    return {status:422,payload:{
                        success: false,
                        code: "MAI_MACHINE_LINE_MASTER_INVALID",
                        message: `Máy/sản phẩm ở dòng ${index + 1} không hợp lệ`,
                        errors: { machine_code: lineMachine, product_code: lineProduct, ...masterValidation.errors }
                    }};
                }
                const duplicate = await ProductionTemp.findSimilarReport({
                    workerId, processId, workDate, shift,
                    machineNo: masterValidation.machineCode,
                    productName: masterValidation.productCode
                });
                if (duplicate && !report) report = duplicate;
            }
        } else {
            const masterValidation = await validateMasterData({
                workerId, processId, machineNo, productName, defects: [], deductions: [],
                workDate, operationMode,
                operationType: normalizeOperationType(body?.operation_type), workType
            });
            if (!masterValidation.valid) {
                return {status:422,payload:{
                    success: false,
                    message: "Máy hoặc sản phẩm không khớp danh mục hệ thống",
                    errors: masterValidation.errors
                }};
            }
            report = await ProductionTemp.findSimilarReport({
                workerId, processId, workDate, shift,
                machineNo: masterValidation.machineCode,
                productName: masterValidation.productCode
            });
        }

        return {status:200,payload:{
            success: true,
            duplicate: Boolean(report),
            data: report || null,
            message: report
                ? "Đã tồn tại báo cáo cùng nhân viên, ngày, ca, máy và sản phẩm"
                : "Không có báo cáo tương tự"
        }};
}
module.exports={checkSimilarReport};
