const { listEditProposals } = require("../services/productionTempEditProposalService");

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
