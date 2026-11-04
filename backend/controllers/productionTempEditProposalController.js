const { listEditProposals, createEditProposal } = require("../services/productionTempEditProposalService");

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
