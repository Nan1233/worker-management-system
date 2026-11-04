const { listEditProposals, createEditProposal, updateEditProposal, deleteEditProposal } = require("../services/productionTempEditProposalService");

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
