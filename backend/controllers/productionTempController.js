const { TtlCache } = require("../utils/cache");
const managerListCache = new TtlCache({ maxEntries: 300 });
const MANAGER_LIST_TTL_MS = 15000;
const ProductionTemp = require("../models/productionTempModel");
const SyncJobService = require("../services/syncJobService");
const MonthlyExcelService = require("../services/monthlyExcelService");
const AuditService = require("../services/auditService");
const db = require("../config/db");
const { publicMessage } = require("../utils/httpError");

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


        // =================================================
        // KIỂM TRA DANH MỤC MÁY, SẢN PHẨM, NG, TRỪ GIỜ
        // =================================================

        const masterValidation =
            await validateMasterData({
                workerId,
                processId,

                machineNo:
                    validation.normalized
                        .machine_no,

                productName:
                    validation.normalized
                        .product_name,

                defects,
                deductions,
                ttOk: validation.normalized.tt_ok,
                actualOutput: validation.normalized.actual_output
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

            worker_id:
                workerId,

            process_id:
                processId,

            machine_no:
                masterValidation.machineCode,

            product_name:
                masterValidation.productCode,

            standard_output:
                masterValidation.standardOutput,

            exclude_kqd_from_tt:
                masterValidation.excludeKqdFromTt,

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
                    deductions
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

        // Tự động tạo/cập nhật file Excel tháng ngay sau khi duyệt.
        // Service dùng file tạm rồi rename nên file cũ được thay thế nguyên tử,
        // giữ nguyên cùng tên và không cần bước xác nhận.
        MonthlyExcelService.scheduleMonthlyRebuild(result.dates);

        let syncQueued = true;
        try {
            await SyncJobService.enqueueForApprovedDates(result.dates);

            // Chạy một nhịp đồng bộ ngay trên web service để Sheet vẫn cập nhật
            // khi Background Worker/Cron chưa được cấu hình. Worker riêng vẫn là
            // cơ chế retry chính cho các lần thất bại tiếp theo.
            if (String(process.env.INLINE_SYNC_TRIGGER || "true").toLowerCase() !== "false") {
                setImmediate(() => {
                    SyncJobService.processReadyJobs(2).catch((inlineError) => {
                        console.error("INLINE SYNC PROCESS ERROR:", inlineError);
                    });
                });
            }
        } catch (queueError) {
            syncQueued = false;
            console.error("CREATE SYNC JOB ERROR:", queueError);
        }

        return res.status(200).json({
            success: true,
            warning: !syncQueued,
            message: syncQueued
                ? "Duyệt thành công; Google Sheet và Excel đã được đưa vào hàng đợi đồng bộ"
                : "Duyệt thành công nhưng chưa tạo được hàng đợi đồng bộ",
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
        const master = await validateMasterData({ workerId: current.worker_id, processId: current.process_id, machineNo: validation.normalized.machine_no, productName: validation.normalized.product_name, defects: validation.normalized.defects, deductions: validation.normalized.deductions, ttOk: validation.normalized.tt_ok, actualOutput: validation.normalized.actual_output });
        if (!master.valid) return res.status(422).json({ success: false, message: "Dữ liệu danh mục không hợp lệ", errors: master.errors });
        const normalizedUpdate = {
            ...validation.normalized,
            machine_no: master.machineCode,
            product_name: master.productCode,
            standard_output: master.standardOutput,
            exclude_kqd_from_tt: master.excludeKqdFromTt
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
