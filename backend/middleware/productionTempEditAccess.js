const ProductionTemp = require("../models/productionTempModel");

const denyAdminOpsPendingEdit = (req, res, next) => {
    if (String(req.user?.role || "").toLowerCase() === "admin_ops") {
        return res.status(403).json({
            success: false,
            code: "ROLE_SCOPE_FORBIDDEN",
            message: "Admin vận hành không được sửa báo cáo đang chờ duyệt"
        });
    }
    return next();
};

const ensureLeadOwnsTempReport = async (req, res, next) => {
    if (String(req.user?.role || "").toLowerCase() !== "lead") {
        return next();
    }

    try {
        const reportId = Number(req.params.id);
        const report = await ProductionTemp.getDetail(reportId);
        if (!report) {
            return res.status(404).json({ success: false, message: "Không tìm thấy báo cáo" });
        }
        if (Number(report.proposer_user_id) !== Number(req.user.id)) {
            return res.status(403).json({ success: false, message: "Lead chỉ được sửa đề xuất của chính mình" });
        }
        return next();
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Không thể kiểm tra quyền sửa báo cáo"
        });
    }
};

module.exports = {
    denyAdminOpsPendingEdit,
    ensureLeadOwnsTempReport
};
