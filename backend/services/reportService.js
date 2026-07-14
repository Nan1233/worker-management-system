const db = require("../config/db");


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


            pr.status


        FROM production_reports pr


        JOIN workers w

        ON pr.worker_id=w.id



        JOIN users u

        ON w.user_id=u.id



        LEFT JOIN processes p

        ON pr.process_id=p.id



        WHERE DATE(pr.work_date)=?



        AND pr.status='approved'


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
router.post(
    "/create-sheet",
    createGoogleSheet
);


router.post(
    "/update-sheet",
    updateGoogleSheet
);