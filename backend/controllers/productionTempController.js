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

        const report = await ProductionTemp.findSimilarReport({
            workerId, processId, workDate, shift, machineNo, productName
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

            standard_output:
                masterValidation
                    .standardOutput ??
                validation.normalized
                    .standard_output,

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

                    log: {
                        reportType:
                            "temp",

                        userId:
                            req.user.id,

                        action:
                            "CREATE",

                        note:
                            "Công nhân tạo báo cáo",

                        ...requestMeta(req)
                    }
                });


        // Nếu request bị gửi trùng thì không tạo lại notification
        if (!result.duplicate) {
            let worker = {
                worker_code: "---",
                full_name: "---"
            };

            let process = {
                process_name: "---"
            };


            // =============================================
            // LẤY THÔNG TIN CÔNG NHÂN VÀ CÔNG ĐOẠN
            // =============================================

            try {
                const [workerRows] =
                    await db.promise().query(
                        `
                        SELECT
                            w.worker_code,
                            u.full_name
                        FROM workers w
                        INNER JOIN users u
                            ON u.id = w.user_id
                        WHERE w.id = ?
                        LIMIT 1
                        `,
                        [workerId]
                    );


                if (workerRows.length > 0) {
                    worker =
                        workerRows[0];
                }


                const [processRows] =
                    await db.promise().query(
                        `
                        SELECT
                            process_name
                        FROM processes
                        WHERE id = ?
                        LIMIT 1
                        `,
                        [processId]
                    );


                if (processRows.length > 0) {
                    process =
                        processRows[0];
                }
            } catch (lookupError) {
                console.error(
                    "LOAD REPORT DISPLAY INFO ERROR:",
                    lookupError
                );
            }


            // =============================================
            // GHI LỊCH SỬ HOẠT ĐỘNG CHO MANAGER/LEADER
            // Không để lỗi activity làm API lưu báo cáo thất bại
            // =============================================

            try {
                await AuditService.logActivity({
                    userId:
                        req.user.id,

                    action:
                        "CREATE_REPORT",

                    entityType:
                        "temp_report",

                    entityId:
                        result.id,

                    description:
                        `${worker.worker_code} - ` +
                        `${worker.full_name} tạo báo cáo ` +
                        `công đoạn ${process.process_name}, ` +
                        `ca ${data.shift}, ` +
                        `máy ${data.machine_no || "---"}, ` +
                        `sản phẩm ${data.product_name || "---"}`,

                    metadata: {
                        report_id:
                            result.id,

                        worker_id:
                            workerId,

                        worker_code:
                            worker.worker_code,

                        worker_name:
                            worker.full_name,

                        process_id:
                            processId,

                        process_name:
                            process.process_name,

                        work_date:
                            data.work_date,

                        shift:
                            data.shift,

                        machine_no:
                            data.machine_no,

                        product_name:
                            data.product_name,

                        tt_ok:
                            data.tt_ok,

                        tt_ng:
                            data.tt_ng
                    },

                    req
                });
            } catch (auditError) {
                console.error(
                    "CREATE REPORT ACTIVITY LOG ERROR:",
                    auditError
                );
            }


            // =============================================
            // GỬI THÔNG BÁO CHO MANAGER, LEADER, ADMIN
            // =============================================

            try {
                const [reviewers] =
                    await db.promise().query(
                        `
                        SELECT DISTINCT
                            u.id,
                            u.role
                        FROM users u
                        LEFT JOIN manager_processes mp
                            ON mp.manager_id = u.id
                        WHERE u.status = 'active'
                          AND (
                                u.role = 'admin'
                                OR (
                                    u.role IN (
                                        'manager',
                                        'lead'
                                    )
                                    AND mp.process_id = ?
                                )
                          )
                        `,
                        [processId]
                    );


                for (const reviewer of reviewers) {
                    let linkUrl =
                        `/manager/reports?date=${data.work_date}`;


                    if (reviewer.role === "lead") {
                        linkUrl =
                            `/lead/reports?date=${data.work_date}`;
                    }


                    if (reviewer.role === "admin") {
                        linkUrl =
                            `/manager/reports?date=${data.work_date}`;
                    }


                    await AuditService.notifyUsers(
                        [reviewer.id],
                        {
                            type:
                                "info",

                            title:
                                "Có báo cáo mới chờ duyệt",

                            message:
                                `${worker.worker_code} - ` +
                                `${worker.full_name} vừa gửi ` +
                                `báo cáo công đoạn ` +
                                `${process.process_name}, ` +
                                `ca ${data.shift}, ` +
                                `sản phẩm ` +
                                `${data.product_name || "---"}.`,

                            linkUrl,

                            entityType:
                                "temp_report",

                            entityId:
                                result.id
                        }
                    );
                }
            } catch (notificationError) {
                console.error(
                    "CREATE REPORT NOTIFICATION ERROR:",
                    notificationError
                );
            }
        }


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
                    result.id
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

        const data = await ProductionTemp.getPending(userId, {
            date: req.query.date || null,
            shift: req.query.shift || null,
            process_id: toPositiveInteger(req.query.process_id),
            search: req.query.search?.trim() || null
        }, req.user?.role === "admin");
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

        const data = await ProductionTemp.getApproved(userId, {
            date: req.query.date || null,
            shift: req.query.shift || null,
            process_id: toPositiveInteger(req.query.process_id),
            search: req.query.search?.trim() || null
        }, req.user?.role === "admin");
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

// exports.rejectSelectedReports = async (req, res) => {
//     try {
//         const ids = normalizeIds(req.body?.ids);
//         const reviewerId = toPositiveInteger(req.user?.id);
//         const reason = String(req.body?.reason || "").trim();

//         if (ids.length === 0) return res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất một báo cáo" });
//         if (!reason) return res.status(400).json({ success: false, message: "Vui lòng nhập lý do từ chối" });

//         const result = await ProductionTemp.rejectSelected(ids, reviewerId, reason, req.user?.role === "admin");
//         return res.status(200).json({ success: true, message: "Từ chối báo cáo thành công", data: result });
//     } catch (error) {
//         console.error("REJECT SELECTED REPORTS ERROR:", error);
//         return res.status(400).json({ success: false, message: error.message || "Không thể từ chối báo cáo" });
//     }
// };

exports.updateTempReport = async (req, res) => {
    try {
        const reportId = toPositiveInteger(req.params.id);
        const changedBy = toPositiveInteger(req.user?.id);
        if (!reportId) return res.status(400).json({ success: false, message: "ID báo cáo không hợp lệ" });

        const current = await ProductionTemp.getDetail(reportId);
        if (!current) return res.status(404).json({ success: false, message: "Không tìm thấy báo cáo" });
        const payload = { ...current, ...(req.body || {}), defects: req.body?.defects ?? current.defects, deductions: req.body?.deductions ?? current.deductions };
        const validation = validateProductionReport(payload, { enforceBackDate: false });
        if (!validation.valid) return res.status(422).json({ success: false, message: "Dữ liệu báo cáo không hợp lệ", errors: validation.errors });
        const master = await validateMasterData({ workerId: current.worker_id, processId: current.process_id, machineNo: validation.normalized.machine_no, productName: validation.normalized.product_name, defects: validation.normalized.defects, deductions: validation.normalized.deductions, ttOk: validation.normalized.tt_ok, actualOutput: validation.normalized.actual_output });
        if (!master.valid) return res.status(422).json({ success: false, message: "Dữ liệu danh mục không hợp lệ", errors: master.errors });
        const result = await ProductionTemp.updateReport(
            reportId,
            validation.normalized,
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
