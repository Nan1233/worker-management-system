const Production = require("../models/productionModel");

// =======================
// GET ALL REPORTS (DỮ LIỆU CHÍNH)
// =======================

exports.getAllReports = async (req, res) => {

    try {

        const reports = await Production.getAll();

        res.json({
            success: true,
            data: reports
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


// =======================
// GET DETAIL
// =======================

exports.getReportById = async (req, res) => {

    try {

        const report = await Production.getById(req.params.id);

        if (!report) {

            return res.status(404).json({
                success: false,
                message: "Không tìm thấy báo cáo"
            });

        }

        res.json({
            success: true,
            data: report
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


// =======================
// UPDATE
// =======================

exports.updateReport = async (req, res) => {

    try {

        await Production.update(
            req.params.id,
            req.body
        );

        res.json({
            success: true,
            message: "Cập nhật thành công"
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


// =======================
// DELETE
// =======================

exports.deleteReport = async (req, res) => {

    try {

        await Production.delete(req.params.id);

        res.json({
            success: true,
            message: "Xóa thành công"
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};