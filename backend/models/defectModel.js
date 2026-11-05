const db = require("../config/db");



const Defect = {



// =====================================================
// LẤY LỖI THEO CÔNG ĐOẠN
// GET /api/processes/:id/defects
// =====================================================

getByProcess(process_id){


    return new Promise((resolve,reject)=>{


        const sql = `


        SELECT


            id,

            defect_code,

            defect_name,

            sort_order



        FROM defect_types



        WHERE process_id = ?



        AND status='active'

        -- K2 uses only canonical K2_NG_* entries; hide duplicate legacy KTC_DEF_K2_* rows.
        AND (
          COALESCE((SELECT UPPER(TRIM(process_code)) FROM processes WHERE id = ? LIMIT 1), '') <> 'K2'
          OR defect_code LIKE 'K2_NG_%'
        )

        ORDER BY sort_order ASC



        `;



        db.query(

            sql,

            [process_id, process_id],


            (err,rows)=>{


                if(err)

                    return reject(err);



                resolve(rows);



            }


        );


    });


},





// =====================================================
// LẤY CHI TIẾT LỖI
// =====================================================

getById(id){


    return new Promise((resolve,reject)=>{


        db.query(


            `

            SELECT *

            FROM defect_types

            WHERE id=?

            `,


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



module.exports = Defect;