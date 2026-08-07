const db = require("../config/db");



const Deduction = {



// =====================================================
// LẤY TRỪ GIỜ THEO CÔNG ĐOẠN
// GET /api/processes/:id/deductions
// =====================================================

getByProcess(process_id){


    return new Promise((resolve,reject)=>{


        const sql = `


        SELECT


            id,

            deduction_code,

            deduction_name,

            sort_order



        FROM deduction_types



        WHERE process_id = ?



        AND status='active'



        ORDER BY sort_order ASC



        `;



        db.query(

            sql,

            [process_id],


            (err,rows)=>{


                if(err)

                    return reject(err);



                resolve(rows);



            }


        );


    });


},





// =====================================================
// LẤY CHI TIẾT TRỪ GIỜ
// =====================================================

getById(id){


    return new Promise((resolve,reject)=>{


        const sql = `


        SELECT *

        FROM deduction_types

        WHERE id=?


        `;



        db.query(

            sql,

            [id],


            (err,result)=>{


                if(err)

                    return reject(err);



                resolve(result[0]);


            }


        );


    });


}



};



module.exports = Deduction;