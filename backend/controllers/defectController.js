const Defect = require("../models/defectModel");




// =====================================================
// LẤY LỖI THEO CÔNG ĐOẠN
// GET /api/processes/:id/defects
// =====================================================

exports.getDefectsByProcess = async(req,res)=>{


    try{


        const process_id = req.params.id;



        const data = await Defect.getByProcess(

            process_id

        );



        res.json({

            success:true,

            data

        });



    }


    catch(err){


        res.status(500).json({

            success:false,

            message:"Không thể xử lý loại lỗi"

        });


    }


};