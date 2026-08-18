const ProductionTemp = require("../models/productionTempModel");
const { normalizePagination } = require("../services/managerReportPaginationService");

// Legacy manager endpoint kept for compatibility. It MUST use the same
// process-scoped query path as /api/production-temp/pending so an old client
// cannot bypass manager_processes authorization.
exports.getTempReports = async (req, res) => {
    try {
        const isAdmin = req.user?.role === "admin";
        const managerId = Number(req.user?.id);
        if (!isAdmin && (!Number.isInteger(managerId) || managerId <= 0)) {
            return res.status(401).json({ success: false, message: "Thông tin tài khoản quản lý không hợp lệ" });
        }

        const pagination = normalizePagination(req.query || {});
        const filters = {
            date: req.query?.date,
            date_from: req.query?.date_from,
            date_to: req.query?.date_to,
            shift: req.query?.shift,
            process_id: req.query?.process_id,
            process_name: req.query?.process_name,
            search: req.query?.search,
            pagination,
        };

        const data = await ProductionTemp.getPending(isAdmin ? null : managerId, filters, isAdmin);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET TEMP REPORTS ERROR:", error);
        return res.status(error.status || 500).json({
            success: false,
            code: error.code || undefined,
            message: error.isPublic ? error.message : "Không thể xử lý dữ liệu quản lý",
        });
    }
};
