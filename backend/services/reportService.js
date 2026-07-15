const db = require("../config/db");


// =====================================================
// LẤY REPORT ĐỂ ĐỒNG BỘ GOOGLE SHEET
// LẤY CẢ PENDING + APPROVED
// ƯU TIÊN BẢN GHI MỚI NHẤT
// =====================================================

exports.getApprovedReportsByDate = (date)=>{

    return new Promise((resolve,reject)=>{


        const sql = `

        SELECT

            pr.id,

            pr.work_date,

            pr.shift,

            pr.machine_no,

            pr.product_name,


            w.worker_code,

            u.full_name,


            p.process_name,


            pr.standard_output,

            pr.actual_output,


            pr.tt_ok,

            pr.tt_ng,


            pr.note,


            pr.status,

            pr.created_at



        FROM production_reports pr



        INNER JOIN workers w

        ON pr.worker_id = w.id



        INNER JOIN users u

        ON w.user_id = u.id



        LEFT JOIN processes p

        ON pr.process_id = p.id



        WHERE DATE(pr.work_date)=?



        AND pr.status IN ('approved','pending')



        ORDER BY

            w.worker_code ASC,

            pr.created_at DESC



        `;



        db.query(

            sql,

            [date],

            (err,rows)=>{


                if(err)

                    return reject(err);



                /*
                    xử lý trùng mã NV

                    ví dụ:
                    W001 approved
                    W001 pending

                    => giữ cả 2

                    nhưng nếu cùng trạng thái
                    => lấy bản mới nhất
                */


                const map = {};

                const result = [];



                rows.forEach(item=>{


                    const key =
                    item.worker_code;



                    const statusKey =
                    key + "_" + item.status;



                    if(!map[statusKey]){


                        map[statusKey]=true;


                        result.push(item);


                    }


                });



                resolve(result);


            }


        );


    });


};
exports.getReportsByDate = (date)=>{
    return new Promise((resolve,reject)=>{

        const sql = `
        SELECT
            pr.*,
            w.worker_code,
            u.full_name,
            p.process_name

        FROM production_reports pr

        JOIN workers w
        ON pr.worker_id=w.id

        JOIN users u
        ON w.user_id=u.id

        LEFT JOIN processes p
        ON pr.process_id=p.id

        WHERE DATE(pr.work_date)=?

        ORDER BY pr.created_at ASC
        `;


        db.query(
            sql,
            [date],
            (err,rows)=>{

                if(err)
                    return reject(err);


                resolve(rows);

            }
        );


    });
};