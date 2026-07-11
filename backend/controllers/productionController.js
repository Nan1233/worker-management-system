const Production = require("../models/productionModel");

exports.createReport = async (req, res) => {

    try {

        await Production.create(req.body);

        res.status(201).json({

            success: true,

            message: "Lưu báo cáo thành công"

        });

    }

    catch (err) {

        console.log(err);

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};
exports.getAllReports = async (req, res) => {

    try {

        const reports = await Production.getAll();

        res.status(200).json({

            success: true,

            count: reports.length,

            data: reports

        });

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};

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

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};

exports.updateReport = async (req, res) => {

    try {

        const result = await Production.update(

            req.params.id,

            req.body

        );

        if (result.affectedRows === 0) {

            return res.status(404).json({

                success:false,

                message:"Không tìm thấy báo cáo"

            });

        }

        res.json({

            success:true,

            message:"Cập nhật thành công"

        });

    }

    catch(err){

        res.status(500).json({

            success:false,

            message:err.message

        });

    }

};

exports.deleteReport = async (req, res) => {

    try {

        const result = await Production.delete(req.params.id);

        if (result.affectedRows === 0) {

            return res.status(404).json({

                success: false,

                message: "Không tìm thấy báo cáo"

            });

        }

        res.json({

            success: true,

            message: "Xóa báo cáo thành công"

        });

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};