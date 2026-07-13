const ProductionTemp = require("../models/productionTempModel");

const workerModel = require("../models/workerModel");



// ======================================
// WORKER TẠO BÁO CÁO CHỜ DUYỆT
// ======================================

exports.createTempReport = async(req,res)=>{


    try{


        workerModel.getWorkerByUserId(

            req.user.id,


            async(err,result)=>{


                if(err){

                    return res.status(500).json({

                        success:false,

                        message:err.message

                    });

                }



                if(result.length===0){


                    return res.status(404).json({

                        success:false,

                        message:"Không tìm thấy công nhân"

                    });


                }




                const worker_id=result[0].id;



                await ProductionTemp.create({

                    ...req.body,

                    worker_id,

                    status:"pending"

                });




                res.status(201).json({

                    success:true,

                    message:"Đã gửi báo cáo chờ duyệt"

                });



            }


        );



    }

    catch(err){


        res.status(500).json({

            success:false,

            message:err.message

        });


    }



};







// ======================================
// MANAGER LẤY DANH SÁCH NGÀY
// ======================================

exports.getTempDates = async(req,res)=>{


    try{


        const data =
            await ProductionTemp.getDates();



        res.json({

            success:true,

            data

        });



    }

    catch(err){


        res.status(500).json({

            success:false,

            message:err.message

        });


    }


};








// ======================================
// MANAGER XEM BÁO CÁO THEO NGÀY
// ======================================

exports.getTempReportsByDate = async(req,res)=>{


    try{


        const {
            date
        }=req.query;



        if(!date){


            return res.status(400).json({

                success:false,

                message:"Thiếu ngày"

            });


        }



        const reports =
            await ProductionTemp.getByDate(date);




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









// ======================================
// DUYỆT TOÀN BỘ NGÀY
// ======================================

exports.approveTempByDate = async(req,res)=>{


    try{


        const {
            date
        }=req.body;




        await ProductionTemp.approveByDate(

            date,

            req.user.id

        );




        res.json({

            success:true,

            message:"Đã duyệt toàn bộ báo cáo ngày "+date

        });



    }

    catch(err){


        res.status(500).json({

            success:false,

            message:err.message

        });


    }


};









// ======================================
// CHI TIẾT BÁO CÁO ĐỂ SỬA
// ======================================

exports.getTempReportById = async(req,res)=>{


    try{


        const report =
            await ProductionTemp.getById(
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









// ======================================
// WORKER XEM LỊCH SỬ
// ======================================

exports.getMyTempReports = async(req,res)=>{


    try{


        workerModel.getWorkerByUserId(


            req.user.id,


            async(err,result)=>{


                if(err){

                    return res.status(500).json({

                        success:false,

                        message:err.message

                    });

                }




                const worker_id=result[0].id;



                const reports =
                    await ProductionTemp.getByWorker(
                        worker_id
                    );



                res.json({

                    success:true,

                    data:reports

                });



            }


        );



    }

    catch(err){


        res.status(500).json({

            success:false,

            message:err.message

        });


    }



};