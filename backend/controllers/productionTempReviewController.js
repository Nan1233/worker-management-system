const managementController = require("./productionTempManagementController");
const { rejectSelectedTempReports } = require("../services/rejectSelectedTempReportsService");

const rejectSelectedReports = async (req, res) => {
    try {
        const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : Array.isArray(req.body?.targets) ? req.body.targets.map((item) => item?.id) : [];
        const ids = [...new Set(rawIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
        const reviewerId = Number(req.user?.id);
        const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
        const reason = String(req.body?.reason || "").trim();
        if (!ids.length) return res.status(400).json({ success: false, code: "INVALID_REJECT_SELECTION", message: "Vui lòng chọn ít nhất một báo cáo" });
        if (!Number.isInteger(reviewerId) || reviewerId <= 0) return res.status(401).json({ success: false, code: "INVALID_REVIEWER", message: "Thông tin người xử lý không hợp lệ" });
        if (!reason) return res.status(400).json({ success: false, code: "REJECT_REASON_REQUIRED", message: "Vui lòng nhập lý do từ chối" });
        const result = await rejectSelectedTempReports(ids, reviewerId, reason, isAdmin);
        if (typeof managementController.invalidateManagerReportLists === "function") managementController.invalidateManagerReportLists();
        return res.status(200).json({ success: true, message: result.count > 0 ? "Đã từ chối báo cáo" : "Không có báo cáo nào còn đủ điều kiện để từ chối", data: result });
    } catch (error) {
        console.error("REJECT SELECTED REPORTS ERROR:", error);
        return res.status(Number(error?.status) || 400).json({ success: false, code: error?.code || "REJECT_SELECTED_FAILED", message: error?.message || "Không thể từ chối báo cáo", details: error?.details || undefined });
    }
};

module.exports = {
    rejectSelectedReports
};
