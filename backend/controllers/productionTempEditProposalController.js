const {
    listEditProposals,
    createEditProposal,
    updateEditProposal,
    deleteEditProposal,
    createLegacyEditProposal,
    getProposalDetail,
    canAccessProposalReport,
    setEditProposalStatus
} = require("../services/productionTempEditProposalService");
const ProductionTemp = require("../models/productionTempModel");
const managementController = require("./productionTempManagementController");

exports.getEditProposals = async (req, res) => {
    try {
        const data = await listEditProposals(req.user);
        return res.json({ success: true, data });
    } catch (error) {
        console.error("GET EDIT PROPOSALS ERROR:", error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Không thể tải đề xuất sửa"
        });
    }
};

exports.createEditProposal = async (req, res) => {
    try {
        const data = await createEditProposal({ user: req.user, body: req.body });
        return res.status(201).json({
            success: true,
            message: "Đã tạo đề xuất sửa",
            data
        });
    } catch (error) {
        console.error("CREATE EDIT PROPOSAL ERROR:", error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Không thể tạo đề xuất sửa"
        });
    }
};

exports.updateEditProposal = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const data = await updateEditProposal({ user: req.user, id, body: req.body });
        return res.json({ success: true, message: "Đã cập nhật đề xuất sửa", data });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Không thể cập nhật đề xuất sửa"
        });
    }
};

exports.deleteEditProposal = async (req, res) => {
    try {
        const id = Number(req.params.id);
        await deleteEditProposal({ user: req.user, id });
        return res.json({ success: true, message: "Đã xóa đề xuất sửa" });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Không thể xóa đề xuất sửa"
        });
    }
};

exports.requestEditProposal = async (req, res) => {
    try {
        const reportId = Number(req.params.id);
        if (!Number.isInteger(reportId) || reportId <= 0) {
            return res.status(400).json({ success: false, message: "ID báo cáo không hợp lệ" });
        }
        const reason = String(req.body?.reason || "").trim();
        const proposedData = req.body?.proposed_data || req.body?.payload || null;
        const data = await createLegacyEditProposal({
            user: req.user,
            reportId,
            reason,
            proposedData
        });
        return res.status(201).json({
            success: true,
            message: "Đã tạo đề xuất sửa, báo cáo chưa bị thay đổi",
            data
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Không thể tạo đề xuất sửa"
        });
    }
};

exports.reviewEditProposal = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const decision = String(req.body?.decision || "").toLowerCase();
        const statusAfter = String(req.body?.status_after || "pending").toLowerCase();
        const current = await getProposalDetail(id);
        if (!current) return res.status(404).json({ success: false, message: "Không tìm thấy đề xuất sửa" });
        if (!(await canAccessProposalReport(req.user, current.report_id))) {
            return res.status(403).json({ success: false, message: "Đề xuất ngoài phạm vi phụ trách" });
        }
        if (current.status !== "pending") {
            return res.status(400).json({ success: false, message: "Đề xuất này đã được xử lý" });
        }

        if (decision === "reject") {
            const reason = String(req.body?.reason || "").trim();
            if (reason.length < 2) {
                return res.status(400).json({ success: false, message: "Vui lòng nhập lý do từ chối" });
            }
            await setEditProposalStatus(id, "rejected");
            return res.json({
                success: true,
                message: "Đã từ chối đề xuất sửa",
                data: await getProposalDetail(id)
            });
        }

        if (decision !== "approve") {
            return res.status(400).json({ success: false, message: "Thao tác xử lý không hợp lệ" });
        }

        const proposed = current.proposed_data && typeof current.proposed_data === "object"
            ? current.proposed_data
            : {};
        const updateResult = await managementController.updateTempReportUseCase({
            reportId: current.report_id,
            body: { ...proposed, reason: `Duyệt đề xuất sửa #${id}` },
            user: req.user
        });

        if (updateResult.status >= 400 || updateResult.body?.success === false) {
            return res.status(updateResult.status || 400).json(
                updateResult.body || { success: false, message: "Không thể cập nhật báo cáo theo đề xuất" }
            );
        }

        if (statusAfter === "approved") {
            await ProductionTemp.approveSelected(
                [{ id: current.report_id }],
                Number(req.user.id),
                req.user.role === "admin"
            );
        }

        const newStatus = statusAfter === "approved" ? "approved" : "accepted";
        await setEditProposalStatus(id, newStatus);
        return res.json({
            success: true,
            message: statusAfter === "approved"
                ? "Đã sửa và duyệt báo cáo"
                : "Đã áp dụng đề xuất, báo cáo đang chờ duyệt",
            data: await getProposalDetail(id)
        });
    } catch (error) {
        console.error("REVIEW EDIT PROPOSAL ERROR:", error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Không thể xử lý đề xuất sửa"
        });
    }
};
