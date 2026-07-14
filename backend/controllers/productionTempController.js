const ProductionTemp = require("../models/productionTempModel");


// =====================================================
// WORKER TẠO BÁO CÁO TEMP
// POST /api/production-temp
// =====================================================

exports.createTempReport = async(req,res)=>{

    try{


        const data = {

            ...req.body,

            worker_id:req.user.worker_id

        };



        const tempId =
            await ProductionTemp.create(data);



        await ProductionTemp.createDefects(
            tempId,
            req.body.defects
        );



        await ProductionTemp.createDeductions(
            tempId,
            req.body.deductions
        );



        res.json({

            success:true,

            message:"Tạo báo cáo thành công",

            id:tempId

        });



    }catch(err){


        console.error(err);


        res.status(500).json({

            success:false,

            message:err.message

        });


    }

};







// =====================================================
// WORKER XEM LỊCH SỬ
// GET /api/production-temp/my
// =====================================================

exports.getMyTempReports = async(req,res)=>{

    try{


        const worker_id = req.user.worker_id;


        const data =
        await ProductionTemp.getHistoryByWorker(worker_id);



        res.json(data);


    }
    catch(err){


        console.log(err);


        res.status(500).json({

            message:"Lỗi lấy lịch sử báo cáo"

        });


    }

};







// =====================================================
// MANAGER XEM CHỜ DUYỆT
// =====================================================

exports.getPendingReports = async(req,res)=>{

    try{


        const data =
        await ProductionTemp.getPending(
            req.user.id
        );


        res.json({

            success:true,

            data

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







// =====================================================
// MANAGER XEM ĐÃ DUYỆT
// =====================================================

exports.getApprovedReports = async(req,res)=>{

    try{


        const data =
        await ProductionTemp.getApproved(
            req.user.id
        );


        res.json({

            success:true,

            data

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







// =====================================================
// LẤY DANH SÁCH NGÀY
// =====================================================

exports.getTempDates = async(req,res)=>{

    try{


        const data =
        await ProductionTemp.getDates();



        res.json({

            success:true,

            data

        });



    }catch(err){


        res.status(500).json({

            success:false,

            message:err.message

        });


    }

};







// =====================================================
// XEM THEO NGÀY
// =====================================================

exports.getTempReportsByDate = async(req,res)=>{

    try{


        const data =
        await ProductionTemp.getByDate(
            req.query.date
        );



        res.json({

            success:true,

            data

        });



    }catch(err){


        res.status(500).json({

            success:false,

            message:err.message

        });


    }

};







// =====================================================
// CHI TIẾT
// =====================================================

exports.getTempReportDetail = async(req,res)=>{

    try{


        const data =
        await ProductionTemp.getDetail(
            req.params.id
        );



        if(!data){

            return res.status(404).json({

                success:false,

                message:"Không tìm thấy báo cáo"

            });

        }



        res.json({

            success:true,

            data

        });



    }catch(err){


        res.status(500).json({

            success:false,

            message:err.message

        });


    }

};







// =====================================================
// DUYỆT THEO NGÀY
// =====================================================

exports.approveTempByDate = async(req,res)=>{

    try{


        const {
            date
        } = req.body;



        if(!date){

            return res.status(400).json({

                success:false,

                message:"Thiếu ngày duyệt"

            });

        }



        const result =
await ProductionTemp.approveByDate(
    date,
    req.user.id
);



        res.json({

    success:true,

    message:"Duyệt báo cáo thành công",

    data:result

});



    }catch(err){


        console.error(err);



        res.status(500).json({

            success:false,

            message:err.message

        });


    }

};