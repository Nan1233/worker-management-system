const Production = require("../models/productionModel");

const workerModel = require("../models/workerModel");



// =======================
// CREATE REPORT
// =======================

exports.createReport = async (req, res) => {


    try {


        if (!req.body.process_id) {


            return res.status(400).json({

                success:false,

                message:"Thiếu công đoạn"

            });


        }




        workerModel.getWorkerByUserId(

            req.user.id,


            async (err, result) => {


                if (err) {


                    return res.status(500).json({

                        success:false,

                        message:err.message

                    });


                }




                if (result.length === 0) {


                    return res.status(404).json({

                        success:false,

                        message:"Không tìm thấy công nhân"

                    });


                }




                const worker_id = result[0].id;




                await Production.create({

                    ...req.body,

                    worker_id

                });





                return res.status(201).json({

                    success:true,

                    message:"Lưu báo cáo thành công"

                });


            }

        );



    }

    catch(err){


        return res.status(500).json({

            success:false,

            message:err.message

        });


    }


};





// =======================
// GET ALL REPORTS
// =======================

exports.getAllReports = async(req,res)=>{


    try{


        const reports = await Production.getAll();



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


        const report = await Production.getById(req.params.id);



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


        await Production.delete(req.params.id);



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