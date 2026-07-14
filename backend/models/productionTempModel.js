const db = require("../config/db");


const ProductionTemp = {


// =====================================================
// TẠO BÁO CÁO TEMP
// =====================================================

create(data){

    return new Promise((resolve,reject)=>{


        const sql = `

        INSERT INTO production_reports_temp
        (
            worker_id,
            process_id,

            work_date,
            shift,
            machine_no,

            product_name,

            total_time,
            actual_time,
            deduction_time,

            standard_output,
            actual_output,

            tt_ok,
            tt_ng,

            note,

            status
        )

        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)

        `;



        db.query(

            sql,

            [

                data.worker_id,

                data.process_id,


                data.work_date,

                data.shift,

                data.machine_no,


                data.product_name,


                data.total_time || 0,

                data.actual_time || 0,

                data.deduction_time || 0,


                data.standard_output || 0,

                data.actual_output || 0,


                data.tt_ok || 0,

                data.tt_ng || 0,


                data.note || "",


                "pending"

            ],


            (err,result)=>{


                if(err)

                    return reject(err);



                resolve(result.insertId);


            }

        );


    });

},







// =====================================================
// LƯU LỖI NG
// =====================================================

createDefects(temp_report_id, defects){


    return new Promise((resolve,reject)=>{


        if(!Array.isArray(defects) || defects.length===0)

            return resolve();



        const values = defects.map(item=>[

            temp_report_id,

            item.defect_type_id,

            item.quantity || 0

        ]);



        db.query(

        `

        INSERT INTO production_temp_defects

        (
            temp_report_id,

            defect_type_id,

            quantity

        )

        VALUES ?

        `,


        [values],


        (err,result)=>{


            if(err)

                return reject(err);



            resolve(result);


        });



    });


},







// =====================================================
// LƯU TRỪ GIỜ
// =====================================================

createDeductions(temp_report_id,deductions){


    return new Promise((resolve,reject)=>{


        if(!Array.isArray(deductions) || deductions.length===0)

            return resolve();



        const values = deductions.map(item=>[

            temp_report_id,

            item.deduction_type_id,

            item.hours || 0

        ]);



        db.query(

        `

        INSERT INTO production_temp_deductions

        (
            temp_report_id,

            deduction_type_id,

            hours

        )

        VALUES ?

        `,


        [values],


        (err,result)=>{


            if(err)

                return reject(err);



            resolve(result);


        });


    });


},







// =====================================================
// WORKER XEM BÁO CÁO CỦA MÌNH
// =====================================================

getByWorker(worker_id){


    return new Promise((resolve,reject)=>{


        const sql = `


        SELECT

            pr.*,

            p.process_name


        FROM production_reports_temp pr


        LEFT JOIN processes p

        ON pr.process_id = p.id


        WHERE pr.worker_id = ?


        ORDER BY pr.created_at DESC


        `;



        db.query(

            sql,

            [

                worker_id

            ],


            (err,rows)=>{


                if(err)

                    return reject(err);



                resolve(rows);


            }


        );



    });


},







// =====================================================
// MANAGER XEM CHỜ DUYỆT
// =====================================================

getPending(){


return new Promise((resolve,reject)=>{


db.query(

`

SELECT

pr.*,

w.worker_code,

u.full_name,

p.process_name


FROM production_reports_temp pr


JOIN workers w

ON pr.worker_id=w.id


JOIN users u

ON w.user_id=u.id


JOIN processes p

ON pr.process_id=p.id


WHERE pr.status='pending'


ORDER BY pr.created_at ASC


`,


(err,rows)=>{


if(err)

return reject(err);



resolve(rows);


});


});


},







// =====================================================
// MANAGER XEM ĐÃ DUYỆT
// =====================================================

getApproved(){


return new Promise((resolve,reject)=>{


db.query(

`

SELECT

pr.*,

w.worker_code,

u.full_name,

p.process_name


FROM production_reports_temp pr


JOIN workers w

ON pr.worker_id=w.id


JOIN users u

ON w.user_id=u.id


JOIN processes p

ON pr.process_id=p.id


WHERE pr.status='approved'


ORDER BY pr.approved_at DESC


`,


(err,rows)=>{


if(err)

return reject(err);



resolve(rows);


});


});


},







// =====================================================
// LẤY NGÀY
// =====================================================

getDates(){


return new Promise((resolve,reject)=>{


db.query(

`

SELECT DISTINCT

DATE(work_date) AS date


FROM production_reports_temp


ORDER BY date DESC


`,


(err,rows)=>{


if(err)

return reject(err);



resolve(rows);


});


});


},







// =====================================================
// XEM THEO NGÀY
// =====================================================

getByDate(date){


return new Promise((resolve,reject)=>{


db.query(

`

SELECT


pr.*,

w.worker_code,

u.full_name,

p.process_name


FROM production_reports_temp pr


JOIN workers w

ON pr.worker_id=w.id


JOIN users u

ON w.user_id=u.id


JOIN processes p

ON pr.process_id=p.id


WHERE DATE(pr.work_date)=?


ORDER BY pr.created_at ASC


`,


[date],


(err,rows)=>{


if(err)

return reject(err);



resolve(rows);


});


});


},







// =====================================================
// CHI TIẾT
// =====================================================

getDetail(id){


return new Promise((resolve,reject)=>{


db.query(

`

SELECT

pr.*,

w.worker_code,

u.full_name,

p.process_name


FROM production_reports_temp pr


JOIN workers w

ON pr.worker_id=w.id


JOIN users u

ON w.user_id=u.id


JOIN processes p

ON pr.process_id=p.id


WHERE pr.id=?


`,


[id],


(err,result)=>{


if(err)

return reject(err);



if(result.length===0)

return resolve(null);



resolve(result[0]);


});


});


},







// =====================================================
// DUYỆT
// =====================================================

// =====================================================
// DUYỆT THEO NGÀY
// TEMP -> PRODUCTION
// =====================================================

approveByDate(date, manager_id){

return new Promise(async(resolve,reject)=>{

    let connection;


    try{


        connection = await new Promise((resolve,reject)=>{

            db.getConnection((err,conn)=>{

                if(err)
                    reject(err);

                else
                    resolve(conn);

            });

        });



        connection.beginTransaction(err=>{


            if(err)
                throw err;



            connection.query(

            `
            SELECT *

            FROM production_reports_temp

            WHERE DATE(work_date)=?

            AND status='pending'
            `,

            [date],


            (err,rows)=>{


                if(err)
                    return connection.rollback(()=>{
                        reject(err);
                    });



                if(rows.length===0){

                    return connection.rollback(()=>{

                        resolve({

                            message:"Không có báo cáo chờ duyệt"

                        });

                    });

                }



                let completed = 0;



                rows.forEach(item=>{


                    connection.query(

                    `
                    INSERT INTO production_reports

                    (
                        worker_id,
                        process_id,
                        work_date,
                        shift,
                        machine_no,
                        product_name,

                        total_time,
                        actual_time,
                        deduction_time,

                        standard_output,
                        actual_output,

                        tt_ok,
                        tt_ng,

                        note,

                        status,
                        reviewed_by,
                        approved_at
                    )

                    VALUES
                    (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())

                    `,


                    [

                        item.worker_id,
                        item.process_id,
                        item.work_date,
                        item.shift,
                        item.machine_no,
                        item.product_name,

                        item.total_time,
                        item.actual_time,
                        item.deduction_time,

                        item.standard_output,
                        item.actual_output,

                        item.tt_ok,
                        item.tt_ng,

                        item.note,

                        "approved",

                        manager_id

                    ],



                    (err)=>{


                        if(err){

                            return connection.rollback(()=>{

                                reject(err);

                            });

                        }



                        connection.query(

                        `
                        DELETE FROM production_reports_temp

                        WHERE id=?

                        `,

                        [item.id],


                        err=>{


                            if(err){

                                return connection.rollback(()=>{

                                    reject(err);

                                });

                            }



                            completed++;



                            if(completed===rows.length){


                                connection.commit(err=>{


                                    if(err){

                                        return connection.rollback(()=>{

                                            reject(err);

                                        });

                                    }


                                    connection.release();



                                    resolve({

                                        message:"Duyệt thành công",

                                        count:completed

                                    });


                                });


                            }



                        });


                    });


                });



            });


        });



    }
    catch(err){


        if(connection)
            connection.release();


        reject(err);


    }


});


},
// =====================================================
// WORKER LỊCH SỬ FULL
// pending + approved
// =====================================================

getHistoryByWorker(worker_id){

return new Promise((resolve,reject)=>{


const sql = `

SELECT *

FROM

(

    SELECT

    pr.id,

    'approved' AS source,

    pr.worker_id,

    pr.process_id,

    pr.work_date,

    pr.shift,

    pr.machine_no,

    pr.product_name,

    pr.tt_ok,

    pr.tt_ng,

    pr.status,

    pr.created_at,


    p.process_name


    FROM production_reports pr


    LEFT JOIN processes p

    ON pr.process_id=p.id


    WHERE pr.worker_id=?





    UNION ALL





    SELECT

    temp.id,

    'pending' AS source,

    temp.worker_id,

    temp.process_id,

    temp.work_date,

    temp.shift,

    temp.machine_no,

    temp.product_name,

    temp.tt_ok,

    temp.tt_ng,

    temp.status,

    temp.created_at,


    p.process_name


    FROM production_reports_temp temp


    LEFT JOIN processes p

    ON temp.process_id=p.id


    WHERE temp.worker_id=?

    AND temp.status='pending'


) x


ORDER BY created_at DESC



`;



db.query(

sql,

[
worker_id,
worker_id
],


(err,rows)=>{


if(err)

return reject(err);



resolve(rows);


});


});


},


};



module.exports = ProductionTemp;