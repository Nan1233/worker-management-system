const Production = require("../models/productionModel");



// =======================
// GET ALL REPORTS
// =======================

exports.getAllReports = async (req,res)=>{


    try{


        const reports =
            await Production.getAll();



        res.json({

            success:true,

            data:reports

        });



    }
    catch(err){


        res.status(500).json({

            success:false,

            message:err.message

        });


    }


};






// =======================
// GET DANH SÁCH NGÀY
// =======================

exports.getReportDates = async(req,res)=>{


    try{


        const dates =
            await Production.getDates();



        res.json({

            success:true,

            data:dates

        });



    }
    catch(err){


        res.status(500).json({

            success:false,

            message:err.message

        });


    }


};






// =======================
// GET REPORT THEO NGÀY
// =======================

exports.getReportsByDate = async(req,res)=>{


    try{


        const {
            date
        } = req.query;



        if(!date){


            return res.status(400).json({

                success:false,

                message:"Thiếu ngày lọc"

            });


        }



        const reports =
            await Production.getByDate(date);



        res.json({

            success:true,

            data:reports

        });



    }
    catch(err){


        res.status(500).json({

            success:false,

            message:err.message

        });


    }


};






// =======================
// GET DETAIL
// =======================

exports.getReportById = async(req,res)=>{


    try{


        const report =
            await Production.getById(
                req.params.id
            );



        if(!report){


            return res.status(404).json({

                success:false,

                message:"Không tìm thấy báo cáo"

            });


        }



        res.json({

            success:true,

            data:report

        });



    }
    catch(err){


        res.status(500).json({

            success:false,

            message:err.message

        });


    }


};






// =======================
// UPDATE
// =======================

exports.updateReport = async(req,res)=>{


    try{


        await Production.update(

            req.params.id,

            req.body

        );



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







// =======================
// DELETE
// =======================

exports.deleteReport = async(req,res)=>{


    try{


        await Production.delete(
            req.params.id
        );



        res.json({

            success:true,

            message:"Xóa thành công"

        });



    }
    catch(err){


        res.status(500).json({

            success:false,

            message:err.message

        });


    }


};