const Deduction = require("../models/deductionModel");





// =====================================================
// LẤY TRỪ GIỜ THEO CÔNG ĐOẠN
// GET /api/processes/:id/deductions
// =====================================================

exports.getDeductionsByProcess = async(req,res)=>{


    try{


        const process_id = req.params.id;



        const data = await Deduction.getByProcess(

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

            message:err.message

        });


    }


};