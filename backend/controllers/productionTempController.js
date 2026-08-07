const { TtlCache } = require("../utils/cache");
const managerListCache = new TtlCache({ maxEntries: 300 });
const MANAGER_LIST_TTL_MS = 15000;
const ProductionTemp = require("../models/productionTempModel");
const AuditService = require("../services/auditService");
const db = require("../config/db");
const { publicMessage } = require("../utils/httpError");
const { validateMachineLines } = require("../services/machineLineValidationService");
const { getProcessMachinePolicy } = require("../services/processMachinePolicy");
const { envEnabled } = require("../utils/featureFlags");

const {
    validateMasterData
} = require("../services/reportBusinessValidationService");

const {
    validateProductionReport
} = require("../utils/reportValidation");


const toPositiveInteger = (value) => {
    const numberValue = Number(value);

    return Number.isInteger(numberValue) &&
        numberValue > 0
        ? numberValue
        : null;
};




const normalizeOperationType = (value) => {
    const normalized = String(value ?? "").trim().toUpperCase();
    const aliases = {
        CUT: "CUT",
        CAT: "CUT",
        "CẮT": "CUT",
        NEST: "NEST",
        NESTING: "NEST",
        LONG: "NEST",
        "LỒNG": "NEST"
    };
    return aliases[normalized] || null;
};

const normalizeOperationMode = (value) => {
    const normalized = String(value ?? "").trim().toUpperCase();
    const aliases = {
        MANUAL: "MANUAL",
        TAY: "MANUAL",
        MACHINE: "MACHINE",
        MAY: "MACHINE",
        "MÁY": "MACHINE"
    };
    return aliases[normalized] || null;
};


const getVietnamDateKey = () => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const values = Object.fromEntries(
        parts.filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
};

const dateKeyToUtcDay = (dateKey) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || "").trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const value = Date.UTC(year, month - 1, day);
    const date = new Date(value);

    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return null;
    }

    return Math.floor(value / 86400000);
};

const validateWorkerWorkDate = (workDate) => {
    const selectedDay = dateKeyToUtcDay(workDate);
    const todayDay = dateKeyToUtcDay(getVietnamDateKey());

    if (selectedDay === null || todayDay === null) {
        return "Ngày làm việc không hợp lệ";
    }

    if (selectedDay > todayDay) {
        return "Không được gửi báo cáo cho ngày trong tương lai";
    }

    if (selectedDay < todayDay - 14) {
        return "Chỉ được gửi báo cáo trong vòng 14 ngày gần nhất";
    }

    return null;
};

const normalizeIds = (ids) => [
    ...new Set(
        (Array.isArray(ids) ? ids : [])
            .map(Number)
            .filter(
                (id) =>
                    Number.isInteger(id) &&
                    id > 0
            )
    )
];


const requestMeta = (req) => ({
    ipAddress:
        req.headers["x-forwarded-for"]
            ?.split(",")[0]
            ?.trim() ||
        req.ip ||
        null,

    userAgent:
        req.headers["user-agent"] ||
        null
});


const queuePostCreateSideEffects = ({ req, result, workerId, processId, data }) => {
    if (result.duplicate) return;

    const userId = req.user?.id;
    const meta = requestMeta(req);

    setImmediate(async () => {
        try {
            // Nhật ký thao tác chi tiết của báo cáo.
            await ProductionTemp.logAction({
                reportType: "temp",
                reportId: result.id,
                userId,
                action: "CREATE",
                note: "Công nhân tạo báo cáo",
                ...meta
            });
        } catch (error) {
            console.error("CREATE REPORT ACTION LOG ERROR:", error);
        }

        let worker = { worker_code: "---", full_name: "---" };
        let process = { process_name: "---" };

        try {
            const [[workerRows], [processRows], [reviewers]] = await Promise.all([
                db.promise().query(
                    `SELECT w.worker_code, u.full_name
                     FROM workers w
                     INNER JOIN users u ON u.id = w.user_id
                     WHERE w.id = ? LIMIT 1`,
                    [workerId]
                ),
                db.promise().query(
                    `SELECT process_name FROM processes WHERE id = ? LIMIT 1`,
                    [processId]
                ),
                db.promise().query(
                    `SELECT DISTINCT u.id, u.role
                     FROM users u
                     LEFT JOIN manager_processes mp ON mp.manager_id = u.id
                     WHERE u.status = 'active'
                       AND (
                            u.role = 'admin'
                            OR (u.role IN ('manager', 'lead') AND mp.process_id = ?)
                       )`,
                    [processId]
                )
            ]);

            if (workerRows.length) worker = workerRows[0];
            if (processRows.length) process = processRows[0];

            try {
                await AuditService.logActivity({
                    userId,
                    action: "CREATE_REPORT",
                    entityType: "temp_report",
                    entityId: result.id,
                    description:
                        `${worker.worker_code} - ${worker.full_name} tạo báo cáo ` +
                        `công đoạn ${process.process_name}, ca ${data.shift}, ` +
                        `máy ${data.machine_no || "---"}, sản phẩm ${data.product_name || "---"}`,
                    metadata: {
                        report_id: result.id,
                        worker_id: workerId,
                        worker_code: worker.worker_code,
                        worker_name: worker.full_name,
                        process_id: processId,
                        process_name: process.process_name,
                        work_date: data.work_date,
                        shift: data.shift,
                        machine_no: data.machine_no,
                        product_name: data.product_name,
                        tt_ok: data.tt_ok,
                        tt_ng: data.tt_ng
                    },
                    req: {
                        ip: meta.ipAddress,
                        headers: { "user-agent": meta.userAgent }
                    }
                });
            } catch (error) {
                console.error("CREATE REPORT ACTIVITY LOG ERROR:", error);
            }

            const groups = {
                lead: [],
                manager: [],
                admin: []
            };
            reviewers.forEach((reviewer) => {
                if (groups[reviewer.role]) groups[reviewer.role].push(reviewer.id);
            });

            const notification = {
                type: "info",
                title: "Có báo cáo mới chờ duyệt",
                message:
                    `${worker.worker_code} - ${worker.full_name} vừa gửi báo cáo ` +
                    `công đoạn ${process.process_name}, ca ${data.shift}, ` +
                    `sản phẩm ${data.product_name || "---"}.`,
                entityType: "temp_report",
                entityId: result.id
            };

            await Promise.all([
                AuditService.notifyUsers(groups.lead, {
                    ...notification,
                    linkUrl: `/lead/reports?date=${data.work_date}`
                }),
                AuditService.notifyUsers(groups.manager, {
                    ...notification,
                    linkUrl: `/manager/reports?date=${data.work_date}`
                }),
                AuditService.notifyUsers(groups.admin, {
                    ...notification,
                    linkUrl: `/manager/reports?date=${data.work_date}`
                })
            ]);
        } catch (error) {
            console.error("CREATE REPORT BACKGROUND TASK ERROR:", error);
        }
    });
};

// =====================================================
// WORKER TẠO BÁO CÁO CHỜ DUYỆT
// =====================================================

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

exports.getPendingReports = async (req, res) => {
    try {
        const userId = toPositiveInteger(req.user?.id);
        if (!userId) return res.status(401).json({ success: false, message: "Thông tin đăng nhập không hợp lệ" });

        const filters = {
            date: req.query.date || null,
            date_from: req.query.date_from || null,
            date_to: req.query.date_to || null,
            shift: req.query.shift || null,
            process_id: toPositiveInteger(req.query.process_id),
            search: req.query.search?.trim() || null
        };
        const cacheKey = `manager:pending:${req.user?.role}:${userId}:${JSON.stringify(filters)}`;
        let data = managerListCache.get(cacheKey);
        if (data === undefined) {
            data = await ProductionTemp.getPending(userId, filters, req.user?.role === "admin");
            managerListCache.set(cacheKey, data, MANAGER_LIST_TTL_MS);
        }
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET PENDING REPORTS ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Không thể lấy báo cáo chờ duyệt") });
    }
};

exports.getApprovedReports = async (req, res) => {
    try {
        const userId = toPositiveInteger(req.user?.id);
        if (!userId) return res.status(401).json({ success: false, message: "Thông tin đăng nhập không hợp lệ" });

        const filters = {
            date: req.query.date || null,
            date_from: req.query.date_from || null,
            date_to: req.query.date_to || null,
            shift: req.query.shift || null,
            process_id: toPositiveInteger(req.query.process_id),
            search: req.query.search?.trim() || null
        };
        const cacheKey = `manager:approved:${req.user?.role}:${userId}:${JSON.stringify(filters)}`;
        let data = managerListCache.get(cacheKey);
        if (data === undefined) {
            data = await ProductionTemp.getApproved(userId, filters, req.user?.role === "admin");
            managerListCache.set(cacheKey, data, MANAGER_LIST_TTL_MS);
        }
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET APPROVED REPORTS ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Không thể lấy báo cáo đã duyệt") });
    }
};

exports.getTempDates = async (req, res) => {
    try {
        const userId = toPositiveInteger(req.user?.id);
        const data = await ProductionTemp.getDates(req.user?.role === "admin" ? null : userId);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET TEMP DATES ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Không thể lấy danh sách ngày") });
    }
};

exports.getTempReportsByDate = async (req, res) => {
    try {
        if (!req.query.date) return res.status(400).json({ success: false, message: "Thiếu ngày cần xem" });
        const data = await ProductionTemp.getByDate(req.query.date, req.user?.role === "admin" ? null : toPositiveInteger(req.user?.id));
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET TEMP REPORTS BY DATE ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Không thể lấy báo cáo theo ngày") });
    }
};

exports.getTempReportDetail = async (req, res) => {
    try {
        const reportId = toPositiveInteger(req.params.id);
        if (!reportId) return res.status(400).json({ success: false, message: "ID báo cáo không hợp lệ" });

        const data = await ProductionTemp.getDetail(reportId);
        if (!data) return res.status(404).json({ success: false, message: "Không tìm thấy báo cáo" });

        if (req.user?.role === "worker" && Number(data.worker_id) !== Number(req.user?.worker_id)) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền xem báo cáo này" });
        }

        if (req.user?.role !== "worker") {
            const canManage = await ProductionTemp.canManageReport(reportId, req.user.id, req.user?.role === "admin");
            if (!canManage && req.user?.role !== "admin") {
                return res.status(403).json({ success: false, message: "Báo cáo ngoài phạm vi phụ trách" });
            }
        }

        await ProductionTemp.logAction({
            reportType: "temp",
            reportId,
            userId: req.user.id,
            action: "VIEW",
            note: "Xem chi tiết báo cáo",
            ...requestMeta(req)
        });

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET TEMP REPORT DETAIL ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Không thể lấy chi tiết báo cáo") });
    }
};

exports.approveSelectedReports = async (req, res) => {
    try {
        const ids = normalizeIds(req.body?.ids);
        const reviewerId = toPositiveInteger(req.user?.id);
        if (ids.length === 0) return res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất một báo cáo" });
        if (!reviewerId) return res.status(401).json({ success: false, message: "Thông tin người duyệt không hợp lệ" });

        const result = await ProductionTemp.approveSelected(ids, reviewerId, req.user?.role === "admin");

        // Desktop owns workbook generation. Do not enqueue server-side Excel jobs
        // unless a legacy feature has been explicitly enabled.
        const googleSyncEnabled = envEnabled('ENABLE_GOOGLE_SHEET_SYNC');
        const serverExcelEnabled = envEnabled('ENABLE_SERVER_HEAVY_EXCEL') && envEnabled('ENABLE_EXCEL_EXPORT_WORKER');
        let syncQueued = false;

        if (googleSyncEnabled || serverExcelEnabled) {
            try {
                const SyncJobService = require('../services/syncJobService');
                await SyncJobService.enqueueForApprovedDates(result.dates);
                syncQueued = true;

                if (envEnabled('INLINE_SYNC_TRIGGER')) {
                    setImmediate(() => {
                        SyncJobService.processReadyJobs(1).catch((inlineError) => {
                            console.error('INLINE SYNC PROCESS ERROR:', inlineError);
                        });
                    });
                }
            } catch (queueError) {
                console.error('CREATE SYNC JOB ERROR:', queueError);
            }
        }

        return res.status(200).json({
            success: true,
            warning: false,
            message: syncQueued
                ? 'Duyệt thành công; tác vụ đồng bộ tùy chọn đã được xếp hàng'
                : 'Duyệt thành công; Excel sẽ được cập nhật từ ứng dụng Desktop',
            sync_queued: syncQueued,
            data: result
        });
    } catch (error) {
        console.error("APPROVE SELECTED REPORTS ERROR:", error);
        return res.status(error.status || 400).json({ success: false, message: publicMessage(error, "Không thể duyệt báo cáo") });
    }
};

exports.rejectSelectedReports = async (req, res) => {
    try {
        const ids = normalizeIds(req.body?.ids);
        const reviewerId = toPositiveInteger(req.user?.id);
        const reason = String(req.body?.reason || "").trim();

        if (ids.length === 0) return res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất một báo cáo" });
        if (!reviewerId) return res.status(401).json({ success: false, message: "Thông tin người xử lý không hợp lệ" });
        if (!reason) return res.status(400).json({ success: false, message: "Vui lòng nhập lý do từ chối" });

        const result = await ProductionTemp.rejectSelected(ids, reviewerId, reason, req.user?.role === "admin");
        return res.status(200).json({ success: true, message: "Đã từ chối báo cáo", data: result });
    } catch (error) {
        console.error("REJECT SELECTED REPORTS ERROR:", error);
        return res.status(error.status || 400).json({ success: false, message: publicMessage(error, "Không thể từ chối báo cáo") });
    }
};

exports.updateTempReport = async (req, res) => {
    try {
        const reportId = toPositiveInteger(req.params.id);
        const changedBy = toPositiveInteger(req.user?.id);
        if (!reportId) return res.status(400).json({ success: false, message: "ID báo cáo không hợp lệ" });

        const current = await ProductionTemp.getDetail(reportId);
        if (!current) return res.status(404).json({ success: false, message: "Không tìm thấy báo cáo" });
        const payload = { ...current, ...(req.body || {}), defects: req.body?.defects ?? current.defects, deductions: req.body?.deductions ?? current.deductions };

        if (req.user?.role === "worker") {
            const workDateError = validateWorkerWorkDate(payload.work_date);
            if (workDateError) {
                return res.status(422).json({ success: false, message: workDateError });
            }
        }

        const validation = validateProductionReport(payload, { enforceBackDate: false });
        if (!validation.valid) return res.status(422).json({ success: false, message: "Dữ liệu báo cáo không hợp lệ", errors: validation.errors });
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
            return res.status(422).json({ success: false, message: "Công đoạn này chỉ thực hiện bằng tay", errors: { machine_no: "Không được chọn máy" } });
        }
        if (machinePolicy.mode === "MULTI_MACHINE_REQUIRED" && rawMachineLines.length === 0) {
            return res.status(422).json({ success: false, message: "Công đoạn này bắt buộc nhập danh sách máy", errors: { machine_lines: "Vui lòng chọn từ 1 đến 4 máy" } });
        }
        if (machinePolicy.mode === "SINGLE_MACHINE_REQUIRED" && (!normalizedMachineNo || rawMachineLines.length > 1)) {
            return res.status(422).json({ success: false, message: "Công đoạn Cán yêu cầu đúng một máy", errors: { machine_no: "Vui lòng chọn đúng một máy cán" } });
        }
        if (machinePolicy.mode === "MANUAL_OR_SINGLE_MACHINE" && rawMachineLines.length > 1) {
            return res.status(422).json({ success: false, message: "Công đoạn Kiểm chỉ được chọn tối đa một máy", errors: { machine_lines: "Chỉ được chọn một máy hoặc làm tay" } });
        }

        const machineValidation = await validateMachineLines({
            processId: current.process_id,
            machineLines: rawMachineLines,
            operationType,
            operationMode: operationMode || (rawMachineLines.length ? "MACHINE" : "MANUAL"),
            maxMachines: machinePolicy.maxMachines || 4
        });
        if (!machineValidation.valid) {
            return res.status(422).json({
                success: false,
                message: "Thông tin máy hoặc thời gian máy không hợp lệ",
                errors: machineValidation.errors
            });
        }

        const firstLine = machineValidation.lines[0] || null;
        const master = await validateMasterData({
            workerId: current.worker_id,
            processId: current.process_id,
            machineNo: firstLine?.machine_code || validation.normalized.machine_no,
            productName: firstLine?.product_code || validation.normalized.product_name,
            defects: validation.normalized.defects,
            deductions: validation.normalized.deductions,
            ttOk: operationMode === "MANUAL" ? validation.normalized.tt_ok : undefined,
            actualOutput: operationMode === "MANUAL" ? validation.normalized.actual_output : undefined,
            allowEmptyMachine: operationMode === "MANUAL" || machinePolicy.mode === "MANUAL_ONLY"
        });
        if (!master.valid) return res.status(422).json({ success: false, message: "Dữ liệu danh mục không hợp lệ", errors: master.errors });

        const hasMachineLines = machineValidation.lines.length > 0;
        const totalMachineHours = Number(machineValidation.totals?.totalMachineHours || 0);
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
                : validation.normalized.actual_output,
            tt_ok: hasMachineLines
                ? Number(machineValidation.totals?.totalOk || 0)
                : validation.normalized.tt_ok,
            tt_ng: hasMachineLines
                ? Number(machineValidation.totals?.totalNg || 0)
                : validation.normalized.tt_ng,
            exclude_kqd_from_tt: hasMachineLines ? 0 : master.excludeKqdFromTt,
            machine_lines: machineValidation.lines
        };

        const result = await ProductionTemp.updateReport(
            reportId,
            normalizedUpdate,
            changedBy,
            req.body?.reason || null,
            {
                isAdmin: req.user?.role === "admin",
                workerId: req.user?.role === "worker" ? req.user?.worker_id : null
            }
        );

        return res.status(200).json({
            success: true,
            message: result.changed ? "Cập nhật báo cáo thành công" : "Không có dữ liệu thay đổi",
            data: result
        });
    } catch (error) {
        console.error("UPDATE TEMP REPORT ERROR:", error);
        return res.status(error.status || 400).json({ success: false, message: publicMessage(error, "Không thể cập nhật báo cáo") });
    }
};

exports.getReportActionLogs = async (req, res) => {
    try {
        const reportId = toPositiveInteger(req.params.id);
        if (!reportId) return res.status(400).json({ success: false, message: "ID báo cáo không hợp lệ" });

        const report = await ProductionTemp.getDetail(reportId);
        if (!report) return res.status(404).json({ success: false, message: "Không tìm thấy báo cáo" });

        if (req.user?.role === "worker" && Number(report.worker_id) !== Number(req.user?.worker_id)) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền xem lịch sử báo cáo này" });
        }

        if (req.user?.role !== "worker" && req.user?.role !== "admin") {
            const canManage = await ProductionTemp.canManageReport(reportId, req.user.id, req.user?.role === "admin");
            if (!canManage) return res.status(403).json({ success: false, message: "Báo cáo ngoài phạm vi phụ trách" });
        }

        const data = await ProductionTemp.getActionLogs(reportId, "temp");
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET REPORT ACTION LOGS ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Không thể lấy lịch sử thao tác") });
    }
};
