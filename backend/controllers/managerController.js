const ProductionTemp = require("../models/productionTempModel");


// =======================
// MANAGER GET TEMP REPORTS
// =======================

exports.getTempReports = async (req, res) => {

    try {

        const reports = await ProductionTemp.getAll();


        res.json({

            success: true,

            data: reports

        });


    } catch (err) {


        res.status(500).json({

            success:false,

            message:"Không thể xử lý dữ liệu quản lý"

        });


    }

};