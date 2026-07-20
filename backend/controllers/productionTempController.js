const ProductionTemp = require("../models/productionTempModel");
const SyncJobService = require("../services/syncJobService");
const { validateMasterData } = require("../services/reportBusinessValidationService");
const { validateProductionReport } = require("../utils/reportValidation");

const toPositiveInteger = (value) => {
    const numberValue = Number(value);
    return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

const normalizeIds = (ids) => [
    ...new Set(
        (Array.isArray(ids) ? ids : [])
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0)
    )
];

const requestMeta = (req) => ({
    ipAddress: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null,
    userAgent: req.headers["user-agent"] || null
});

exports.createTempReport = async (req, res) => {
    try {
        const workerId = toPositiveInteger(req.user?.worker_id);
        const processId = toPositiveInteger(req.body?.process_id);

        if (!workerId) {
            return res.status(400).json({ success: false, message: "Tài khoản chưa có thông tin nhân viên" });
        }
        if (!processId) {
            return res.status(400).json({ success: false, message: "Công đoạn không hợp lệ" });
        }
        if (!req.body.work_date) {
            return res.status(400).json({ success: false, message: "Thiếu ngày làm việc" });
        }
        if (!req.body.shift) {
            return res.status(400).json({ success: false, message: "Thiếu ca làm việc" });
        }

        const validation = validateProductionReport(req.body);
        if (!validation.valid) {
            return res.status(422).json({
                success: false,
                message: "Dữ liệu báo cáo không hợp lệ",
                errors: validation.errors
            });
        }

        const defects = validation.normalized.defects;
        const deductions = validation.normalized.deductions;
        const masterValidation = await validateMasterData({
            workerId,
            processId,
            machineNo: validation.normalized.machine_no,
            productName: validation.normalized.product_name,
            defects,
            deductions
        });
        if (!masterValidation.valid) {
            return res.status(422).json({
                success: false,
                message: "Dữ liệu không khớp danh mục hệ thống",
                errors: masterValidation.errors
            });
        }

        const data = {
            ...validation.normalized,
            worker_id: workerId,
            process_id: processId,
            standard_output: masterValidation.standardOutput ?? validation.normalized.standard_output,
            defects: undefined,
            deductions: undefined
        };

        const result = await ProductionTemp.createCompleteReport({
            data,
            defects,
            deductions,
            log: {
                reportType: "temp",
                userId: req.user.id,
                action: "CREATE",
                note: "Công nhân tạo báo cáo",
                ...requestMeta(req)
            }
        });

        return res.status(result.duplicate ? 200 : 201).json({
            success: true,
            duplicate: result.duplicate,
            message: result.duplicate ? "Yêu cầu này đã được ghi nhận trước đó" : "Tạo báo cáo thành công",
            id: result.id
        });
    } catch (error) {
        console.error("CREATE TEMP REPORT ERROR:", error);
        return res.status(500).json({ success: false, message: error.message || "Không thể tạo báo cáo" });
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
        return res.status(500).json({ success: false, message: error.message || "Lỗi lấy lịch sử báo cáo" });
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
        return res.status(500).json({ success: false, message: error.message || "Không thể lấy báo cáo chờ duyệt" });
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
        return res.status(500).json({ success: false, message: error.message || "Không thể lấy báo cáo đã duyệt" });
    }
};

exports.getTempDates = async (req, res) => {
    try {
        const userId = toPositiveInteger(req.user?.id);
        const data = await ProductionTemp.getDates(req.user?.role === "admin" ? null : userId);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET TEMP DATES ERROR:", error);
        return res.status(500).json({ success: false, message: error.message || "Không thể lấy danh sách ngày" });
    }
};

exports.getTempReportsByDate = async (req, res) => {
    try {
        if (!req.query.date) return res.status(400).json({ success: false, message: "Thiếu ngày cần xem" });
        const data = await ProductionTemp.getByDate(req.query.date, req.user?.role === "admin" ? null : toPositiveInteger(req.user?.id));
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET TEMP REPORTS BY DATE ERROR:", error);
        return res.status(500).json({ success: false, message: error.message || "Không thể lấy báo cáo theo ngày" });
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
        return res.status(500).json({ success: false, message: error.message || "Không thể lấy chi tiết báo cáo" });
    }
};

exports.approveSelectedReports = async (req, res) => {
    try {
        const ids = normalizeIds(req.body?.ids);
        const reviewerId = toPositiveInteger(req.user?.id);
        if (ids.length === 0) return res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất một báo cáo" });
        if (!reviewerId) return res.status(401).json({ success: false, message: "Thông tin người duyệt không hợp lệ" });

        const result = await ProductionTemp.approveSelected(ids, reviewerId, req.user?.role === "admin");
        let syncQueued = true;
        try {
            await SyncJobService.enqueueForApprovedDates(result.dates);
            SyncJobService.triggerWorker();
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
        return res.status(400).json({ success: false, message: error.message || "Không thể duyệt báo cáo" });
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

        const result = await ProductionTemp.updateReport(
            reportId,
            req.body || {},
            changedBy,
            req.body?.reason || null,
            req.user?.role === "admin"
        );

        return res.status(200).json({
            success: true,
            message: result.changed ? "Cập nhật báo cáo thành công" : "Không có dữ liệu thay đổi",
            data: result
        });
    } catch (error) {
        console.error("UPDATE TEMP REPORT ERROR:", error);
        return res.status(400).json({ success: false, message: error.message || "Không thể cập nhật báo cáo" });
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
        return res.status(500).json({ success: false, message: error.message || "Không thể lấy lịch sử thao tác" });
    }
};
