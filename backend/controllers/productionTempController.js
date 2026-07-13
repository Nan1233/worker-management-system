const ProductionTemp = require("../models/productionTempModel");

const workerModel = require("../models/workerModel");



// =======================
// WORKER TẠO BÁO CÁO TẠM
// =======================

exports.createTempReport = async (req,res)=>{


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





                const worker_id = result[0].id;





                await ProductionTemp.create({

                    ...req.body,


                    worker_id,


                    status:"pending"

                });






                return res.status(201).json({

                    success:true,

                    message:"Đã lưu báo cáo chờ duyệt"

                });



            }



        );



    }


    catch(err){


        console.log(err);


        return res.status(500).json({

            success:false,

            message:err.message

        });


    }


};







// =======================
// MANAGER LẤY DANH SÁCH TẠM
// =======================


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








// =======================
// CHI TIẾT BÁO CÁO TẠM
// =======================


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