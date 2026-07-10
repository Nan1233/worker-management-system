const workerModel = require("../models/workerModel");


exports.getAllWorkers = (req,res)=>{


    workerModel.findAll((err,result)=>{

        if(err){
            return res.status(500).json({
                message:err.message
            });
        }


        res.json(result);

    });


};



exports.createWorker = (req,res)=>{


    const {
        user_id,
        worker_code,
        phone,
        department
    } = req.body;



    if(
        !user_id ||
        !worker_code
    ){

        return res.status(400).json({
            message:"Thiếu dữ liệu"
        });

    }



    workerModel.create(
        {
            user_id,
            worker_code,
            phone,
            department
        },
        (err)=>{

            if(err){

                return res.status(500).json({
                    message:err.message
                });

            }


            res.status(201).json({
                message:"Tạo công nhân thành công"
            });

        }
    );


};