const ProductionTemp = require("../models/productionTempModel");
const { publicMessage } = require("../utils/httpError");
const { validateMachineLines } = require("../services/machineLineValidationService");
const { getProcessMachinePolicy } = require("../services/processMachinePolicy");
const {
    toPositiveInteger,
    normalizeOperationType,
    normalizeOperationMode,
    validateWorkerWorkDate,
} = require("./productionTempControllerUtils");
const { validateMasterData } = require("../services/reportBusinessValidationService");
const { validateProductionReport } = require("../utils/reportValidation");
const { queuePostCreateSideEffects } = require("../services/productionReportSideEffectsService");

exports.checkSimilarReport = async (req, res) => {
    try {
        const workerId = toPositiveInteger(req.user?.worker_id);
        const processId = toPositiveInteger(req.body?.process_id);
        const workDate = String(req.body?.work_date || "").trim();
        const shift = String(req.body?.shift || "").trim();
        const machineNo = String(req.body?.machine_no || "").trim();
        const productName = String(req.body?.product_name || "").trim();

        if (!workerId || !processId || !workDate || !shift || !machineNo || !productName) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin kiểm tra báo cáo trùng" });
        }

        const workDateError = validateWorkerWorkDate(workDate);
        if (workDateError) {
            return res.status(422).json({ success: false, message: workDateError });
        }

        const masterValidation = await validateMasterData({
            workerId,
            processId,
            machineNo,
            productName,
            defects: [],
            deductions: []
        });

        if (!masterValidation.valid) {
            return res.status(422).json({
                success: false,
                message: "Máy hoặc sản phẩm không khớp danh mục hệ thống",
                errors: masterValidation.errors
            });
        }

        const report = await ProductionTemp.findSimilarReport({
            workerId,
            processId,
            workDate,
            shift,
            machineNo: masterValidation.machineCode,
            productName: masterValidation.productCode
        });

        return res.status(200).json({
            success: true,
            duplicate: Boolean(report),
            data: report || null,
            message: report
                ? "Đã tồn tại báo cáo cùng nhân viên, ngày, ca, máy và sản phẩm"
                : "Không có báo cáo tương tự"
        });
    } catch (error) {
        console.error("CHECK SIMILAR REPORT ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Không thể kiểm tra báo cáo trùng") });
    }
};

exports.createTempReport = async (req, res) => {
    try {
        const workerId =
            toPositiveInteger(
                req.user?.worker_id
            );

        const processId =
            toPositiveInteger(
                req.body?.process_id
            );


        if (!workerId) {
            return res.status(400).json({
                success: false,
                message:
                    "Tài khoản chưa có thông tin nhân viên"
            });
        }


        if (!processId) {
            return res.status(400).json({
                success: false,
                message:
                    "Công đoạn không hợp lệ"
            });
        }


        if (!req.body.work_date) {
            return res.status(400).json({
                success: false,
                message:
                    "Thiếu ngày làm việc"
            });
        }


        const workDateError = validateWorkerWorkDate(req.body.work_date);
        if (workDateError) {
            return res.status(422).json({
                success: false,
                message: workDateError
            });
        }


        if (!req.body.shift) {
            return res.status(400).json({
                success: false,
                message:
                    "Thiếu ca làm việc"
            });
        }


        // =================================================
        // VALIDATE DỮ LIỆU NGHIỆP VỤ
        // =================================================

        const validation =
            validateProductionReport(
                req.body
            );


        if (!validation.valid) {
            return res.status(422).json({
                success: false,
                message:
                    "Dữ liệu báo cáo không hợp lệ",
                errors:
                    validation.errors
            });
        }


        const defects =
            validation.normalized.defects;

        const deductions =
            validation.normalized.deductions;

        // Thời gian công nhân vẫn dùng total_time / actual_time hiện có.
        // machine_lines chỉ lưu thời gian chạy riêng của từng máy.
        const operationType = String(req.body?.operation_type || "").trim().toUpperCase() || null;
        const operationMode = String(req.body?.operation_mode || req.body?.execution_method || "").trim().toUpperCase() || null;
        const rawMachineLines = Array.isArray(req.body?.machine_lines)
            ? req.body.machine_lines
            : Array.isArray(req.body?.machines)
                ? req.body.machines.map((item) => ({
                    machine_code: item.machine_code,
                    product_code: item.product_code || validation.normalized.product_name,
                    machine_time_hours: item.machine_time_hours ??
                        ((Number(item.running_hours || 0) * 60 + Number(item.running_minutes || 0)) / 60),
                    ok_quantity: item.ok_quantity || 0,
                    ng_quantity: item.ng_quantity || 0
                }))
                : [];

        const machinePolicy = getProcessMachinePolicy(processId);
        const normalizedMachineNo = String(validation.normalized.machine_no || req.body?.machine_no || "").trim();
        const requestedMachineMode = operationMode === "MACHINE" || rawMachineLines.length > 0 || Boolean(normalizedMachineNo);

        if (machinePolicy.mode === "MANUAL_ONLY" && requestedMachineMode) {
            return res.status(422).json({
                success: false,
                message: "Công đoạn này chỉ thực hiện bằng tay",
                errors: { machine_no: "Không được chọn máy cho công đoạn này" }
            });
        }

        if (machinePolicy.mode === "MULTI_MACHINE_REQUIRED" && rawMachineLines.length === 0) {
            return res.status(422).json({
                success: false,
                message: "Công đoạn này bắt buộc nhập danh sách máy",
                errors: { machine_lines: "Vui lòng chọn từ 1 đến 4 máy và nhập dữ liệu riêng từng máy" }
            });
        }

        if (machinePolicy.mode === "SINGLE_MACHINE_REQUIRED" && (!normalizedMachineNo || rawMachineLines.length > 1)) {
            return res.status(422).json({
                success: false,
                message: "Công đoạn Cán yêu cầu đúng một máy cho mỗi công nhân",
                errors: { machine_no: "Vui lòng chọn đúng một máy cán" }
            });
        }

        if (machinePolicy.mode === "MANUAL_OR_SINGLE_MACHINE" && rawMachineLines.length > 1) {
            return res.status(422).json({
                success: false,
                message: "Công đoạn Kiểm chỉ được chọn tối đa một máy",
                errors: { machine_lines: "Chỉ được chọn một máy hoặc chuyển sang làm tay" }
            });
        }

        let machineValidation = { valid: true, lines: [], totals: null, errors: {} };
        if (rawMachineLines.length > 0) {
            machineValidation = await validateMachineLines({
                processId,
                machineLines: rawMachineLines,
                operationType,
                operationMode: "MACHINE",
                maxMachines: machinePolicy.maxMachines || 4
            });
            if (!machineValidation.valid) {
                return res.status(422).json({
                    success: false,
                    message: "Thông tin máy hoặc thời gian máy không hợp lệ",
                    errors: machineValidation.errors
                });
            }
        } else if (operationMode === "MACHINE" && !normalizedMachineNo) {
            return res.status(422).json({
                success: false,
                message: "Vui lòng chọn máy",
                errors: { machine_no: "Máy không được để trống" }
            });
        }


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
                allowEmptyMachine: operationMode === "MANUAL" || machinePolicy.mode === "MANUAL_ONLY"
            });


        if (!masterValidation.valid) {
            return res.status(422).json({
                success: false,
                message:
                    "Dữ liệu không khớp danh mục hệ thống",
                errors:
                    masterValidation.errors
            });
        }


        const data = {
            ...validation.normalized,

            // work_date là ngày công nhân chọn; entry_date là ngày thực tế nhập báo cáo.
            entry_date: String(req.body?.entry_date || new Date().toISOString().slice(0, 10)).slice(0, 10),
            extra_data: (req.body?.extra_data && typeof req.body.extra_data === "object" && !Array.isArray(req.body.extra_data))
                ? req.body.extra_data
                : {},

            worker_id:
                workerId,

            process_id: processId,
            operation_type: normalizeOperationType(
                validation?.normalized?.operation_type ??
                req.body?.operation_type ??
                req.body?.operationType
            ),
            operation_mode: normalizeOperationMode(
                validation?.normalized?.operation_mode ??
                req.body?.operation_mode ??
                req.body?.operationMode
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

            // Với báo cáo máy, actual_output là sản lượng được tính năng suất sau quy tắc KQD.
            actual_output:
                machineValidation.lines.length
                    ? Number(machineValidation.totals?.totalCounted || 0)
                    : validation.normalized.actual_output,
            tt_ok:
                machineValidation.lines.length
                    ? Number(machineValidation.totals?.totalOk || 0)
                    : validation.normalized.tt_ok,
            tt_ng:
                machineValidation.lines.length
                    ? Number(machineValidation.totals?.totalNg || 0)
                    : validation.normalized.tt_ng,

            exclude_kqd_from_tt:
                machineValidation.lines.length
                    ? (machineValidation.lines.every((line) => Number(line.exclude_kqd_from_tt || 0) === 1) ? 1 : 0)
                    : masterValidation.excludeKqdFromTt,

            defects:
                undefined,

            deductions:
                undefined,

            force_create:
                req.body?.force_create === true
        };


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
                    machineLines: machineValidation.lines
                });


        queuePostCreateSideEffects({
            req,
            result,
            workerId,
            processId,
            data
        });

        return res
            .status(
                result.duplicate
                    ? 200
                    : 201
            )
            .json({
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

                data:
                    result.existing_report || null
            });
    } catch (error) {
        console.error(
            "CREATE TEMP REPORT ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Không thể tạo báo cáo"
        });
    }
};

exports.getMyTempReports = async (req, res) => {
    try {
        const workerId = toPositiveInteger(req.user?.worker_id);
        if (!workerId) {
            return res.status(400).json({ success: false, message: "Tài khoản chưa có thông tin nhân viên" });
        }
        const data = await ProductionTemp.getHistoryByWorker(workerId);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET MY TEMP REPORTS ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Lỗi lấy lịch sử báo cáo") });
    }
};

