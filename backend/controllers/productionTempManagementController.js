const { editPendingReport } = require('../services/pendingReportEditService');
const db = require("../config/db");
const { getCachedManagerReports, invalidateManagerReportLists } = require("../services/managerReportListCacheService");
const ProductionTemp = require("../models/productionTempModel");
const { publicMessage } = require("../utils/httpError");
const { approveReports, rejectReports } = require("../services/pendingReportReviewService");
const {
    toPositiveInteger,
    normalizeReviewTargets,
    requestMeta,
} = require("./productionTempControllerUtils");

exports.getPendingReports = async (req, res) => {
    try {
        const userId = toPositiveInteger(req.user?.id);
        if (!userId) return res.status(401).json({ success: false, message: "Thông tin đăng nhập không hợp lệ" });

        const data = await getCachedManagerReports("pending", {query:req.query,actor:req.user}, userId);
        return res.status(200).json({
            success: true,
            data: data.items,
            pagination: data.pagination,
            processes: data.processes,
            previous_count: data.previous_count
        });
    } catch (error) {
        console.error("GET PENDING REPORTS ERROR:", error);
        return res.status(error.status || 500).json({ success: false, code: error.code || undefined, message: publicMessage(error, "Không thể lấy báo cáo chờ duyệt") });
    }
};

exports.getApprovedReports = async (req, res) => {
    try {
        const userId = toPositiveInteger(req.user?.id);
        if (!userId) return res.status(401).json({ success: false, message: "Thông tin đăng nhập không hợp lệ" });

        const data = await getCachedManagerReports("approved", {query:req.query,actor:req.user}, userId);
        return res.status(200).json({
            success: true,
            data: data.items,
            pagination: data.pagination,
            processes: data.processes
        });
    } catch (error) {
        console.error("GET APPROVED REPORTS ERROR:", error);
        return res.status(error.status || 500).json({ success: false, code: error.code || undefined, message: publicMessage(error, "Không thể lấy báo cáo đã duyệt") });
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
        const targets = normalizeReviewTargets(req.body);
        const {result,syncQueued} = await approveReports({actor:req.user,targets});

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
        // requestId ties this line to the http access log and to the X-Request-Id the browser saw; errno/sqlState
        // identify masked database failures (the client only gets a generic message in production).
        console.error(`APPROVE SELECTED REPORTS ERROR: requestId=${req.requestId || ""} status=${error.status || 400} code=${error.code || ""} errno=${error.errno || ""} sqlState=${error.sqlState || ""}`, error);
        if (error?.isSubrequestLimit || /too many subrequests/i.test(String(error?.message || ""))) {
            // Platform limit of the Worker invocation, not a business or data error: nothing was approved
            // (the transaction could not finish), so say so and let the user retry instead of a misleading 400.
            return res.status(503).json({
                success: false,
                code: "WORKER_SUBREQUEST_LIMIT",
                message: "Hệ thống đang quá tải khi xử lý báo cáo này. Chưa có báo cáo nào được duyệt, vui lòng thử lại; nếu lỗi lặp lại hãy báo quản trị viên.",
                requestId: req.requestId || undefined,
            });
        }
        return res.status(error.status || 400).json({ success: false, code: error.code || undefined, message: publicMessage(error, "Không thể duyệt báo cáo"), requestId: req.requestId || undefined });
    }
};

exports.rejectSelectedReports = async (req, res) => {
    try {
        const targets = normalizeReviewTargets(req.body);
        const reason = String(req.body?.reason || "").trim();
        const result = await rejectReports({actor:req.user,targets,reason});
        return res.status(200).json({ success: true, message: "Đã từ chối báo cáo", data: result });
    } catch (error) {
        console.error(`REJECT SELECTED REPORTS ERROR: requestId=${req.requestId || ""} status=${error.status || 400} code=${error.code || ""} errno=${error.errno || ""}`, error);
        return res.status(error.status || 400).json({ success: false, code: error.code || undefined, message: publicMessage(error, "Không thể từ chối báo cáo"), requestId: req.requestId || undefined });
    }
};

exports.updateTempReport = async (req, res) => {
    try {
        const result = await editPendingReport({id:req.params.id,actor:req.user,body:req.body,transactionConnection:req.transactionConnection});
        return res.status(200).json({
            success: true,
            message: result.changed ? "Cập nhật báo cáo thành công" : "Không có dữ liệu thay đổi",
            data: result
        });
    } catch (error) {
        if (error?.responseBody) return res.status(error.status).json(error.responseBody);
        console.error("UPDATE TEMP REPORT ERROR:", error);
        if (/too many subrequests/i.test(String(error?.message || ""))) {
            // Cloudflare Worker budget exhausted mid-request. Normally COMMIT never ran (the open transaction is
            // discarded), but if the limit hit at COMMIT the outcome is unknown, so the message asks for a reload
            // (the optimistic version check then prevents a duplicate write) and is not presented as a validation error.
            return res.status(503).json({ success: false, code: "DB_SUBREQUEST_LIMIT_EXCEEDED", message: "Hệ thống đang quá tải truy vấn nên chưa xác nhận được việc lưu thay đổi. Vui lòng tải lại báo cáo để kiểm tra rồi thử lại." });
        }
        return res.status(error.status || 400).json({ success: false, code: error.code || undefined, message: publicMessage(error, "Không thể cập nhật báo cáo") });
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
