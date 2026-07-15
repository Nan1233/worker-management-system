const workerModel = require("../models/workerModel");
const db = require("../config/db");



// ======================================
// ADMIN / MANAGER LẤY TẤT CẢ WORKER
// ======================================

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





// ======================================
// TẠO WORKER
// ======================================

exports.createWorker = (req,res)=>{


    const {
        user_id,
        worker_code,
        phone,
        department
    } = req.body;



    if(!user_id || !worker_code){

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

        err=>{


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






// ======================================
// WORKER LẤY THÔNG TIN CỦA MÌNH
// GET /api/workers/:id
// ======================================

exports.getWorkerById = (req,res)=>{


    const userId = req.params.id;



    const sql = `

    SELECT

        w.id,

        w.worker_code,

        u.full_name AS worker_name


    FROM workers w


    INNER JOIN users u

    ON w.user_id = u.id


    WHERE w.user_id = ?

    `;



    db.query(

        sql,

        [userId],

        (err,result)=>{


            if(err){

                console.log(err);

                return res.status(500).json({

                    message:err.message

                });

            }



            if(result.length===0){

                return res.status(404).json({

                    message:"Không tìm thấy nhân viên"

                });

            }



            res.json({

                success:true,

                data:result[0]

            });


        }

    );


};







// ======================================
// UPDATE WORKER
// ======================================

exports.updateWorker = (req,res)=>{


    const id=req.params.id;


    const {

        worker_code,
        phone,
        department,
        position,
        status

    }=req.body;



    const sql=`

    UPDATE workers

    SET

    worker_code=?,
    phone=?,
    department=?,
    position=?,
    status=?

    WHERE id=?

    `;



    db.query(

        sql,

        [
            worker_code,
            phone,
            department,
            position,
            status,
            id
        ],


        err=>{


            if(err){

                return res.status(500).json({

                    message:err.message

                });

            }



            res.json({

                message:"Cập nhật thành công"

            });


        }

    );


};