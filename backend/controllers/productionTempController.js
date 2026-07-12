const ProductionTemp = require("../models/productionTempModel");



exports.createTempReport = async(req,res)=>{


    try{


        await ProductionTemp.create(req.body);



        res.status(201).json({

            success:true,

            message:"Lưu báo cáo chờ duyệt thành công"

        });


    }

    catch(err){


        console.log(err);


        res.status(500).json({

            success:false,

            message:err.message

        });


    }


};






exports.getTempReports = async(req,res)=>{


    try{


        const reports = await ProductionTemp.getAll();



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






exports.getTempReportById = async(req,res)=>{


    try{


        const report = await ProductionTemp.getById(
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