const db = require("../config/db");


const ProductionTemp = {



    // ==========================
    // WORKER TẠO BÁO CÁO TẠM
    // ==========================

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

                total_time,
                actual_time,
                deduction_time,

                product_name,

                standard_output,
                actual_output,

                tt_ok,
                tt_ng,

                kqd_dap_lai,
                kqd_tuot,

                vo_do_long,
                xuoc_do_long,

                cong_gay,
                xoay,

                khong_dut,
                bavia_hut,

                ppcm,
                loi_cao_su,

                ng_kich_thuoc,
                cat_lem,

                note,

                status
            )


            VALUES
            (
                ?,?,
                ?,?,?,
                ?,?,?,
                ?,
                ?,?,
                ?,?,
                ?,?,
                ?,?,
                ?,?,
                ?,?,
                ?,?,
                ?,?,
                ?,?
            )

            `;



            db.query(
                sql,

                [

                    data.worker_id,
                    data.process_id,

                    data.work_date,
                    data.shift,
                    data.machine_no,

                    data.total_time,
                    data.actual_time,
                    data.deduction_time,

                    data.product_name,

                    data.standard_output,
                    data.actual_output,

                    data.tt_ok,
                    data.tt_ng,

                    data.kqd_dap_lai,
                    data.kqd_tuot,

                    data.vo_do_long,
                    data.xuoc_do_long,

                    data.cong_gay,
                    data.xoay,

                    data.khong_dut,
                    data.bavia_hut,

                    data.ppcm,
                    data.loi_cao_su,

                    data.ng_kich_thuoc,
                    data.cat_lem,

                    data.note,

                    "pending"

                ],

                (err,result)=>{


                    if(err)
                        return reject(err);


                    resolve(result);


                }

            );


        });

    },





    // ==========================
    // MANAGER LẤY TẤT CẢ
    // ==========================

    getAll(){


        return new Promise((resolve,reject)=>{


            const sql = `

            SELECT

                pr.*,

                p.process_name,

                w.worker_code,

                u.full_name


            FROM production_reports_temp pr


            INNER JOIN workers w
            ON pr.worker_id=w.id


            INNER JOIN users u
            ON w.user_id=u.id


            LEFT JOIN processes p
            ON pr.process_id=p.id


            ORDER BY pr.work_date DESC,
                     pr.created_at DESC


            `;



            db.query(
                sql,

                (err,rows)=>{


                    if(err)
                        return reject(err);


                    resolve(rows);


                }

            );


        });


    },






    // ==========================
    // LẤY DANH SÁCH NGÀY CÓ DATA
    // ==========================

    getDates(){


        return new Promise((resolve,reject)=>{


            const sql = `

            SELECT DISTINCT

                DATE(work_date) AS work_date


            FROM production_reports_temp


            ORDER BY work_date DESC


            `;



            db.query(
                sql,

                (err,rows)=>{


                    if(err)
                        return reject(err);


                    resolve(rows);


                }

            );


        });


    },






    // ==========================
    // MANAGER XEM THEO NGÀY
    // ==========================

    getByDate(date){


        return new Promise((resolve,reject)=>{


            const sql = `

            SELECT

                pr.*,

                p.process_name,

                w.worker_code,

                u.full_name


            FROM production_reports_temp pr


            INNER JOIN workers w
            ON pr.worker_id=w.id


            INNER JOIN users u
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


    },







    // ==========================
    // CHI TIẾT 1 BÁO CÁO
    // ==========================

    getById(id){


        return new Promise((resolve,reject)=>{


            const sql = `

            SELECT

                pr.*,

                p.process_name,

                w.worker_code,

                u.full_name


            FROM production_reports_temp pr


            INNER JOIN workers w
            ON pr.worker_id=w.id


            INNER JOIN users u
            ON w.user_id=u.id


            LEFT JOIN processes p
            ON pr.process_id=p.id


            WHERE pr.id=?


            `;



            db.query(

                sql,

                [id],

                (err,rows)=>{


                    if(err)
                        return reject(err);


                    resolve(rows[0]);


                }

            );


        });


    },







    // ==========================
    // SỬA BÁO CÁO TEMP
    // ==========================

    update(id,data){


        return new Promise((resolve,reject)=>{


            const sql = `

            UPDATE production_reports_temp

            SET

                process_id=?,

                work_date=?,

                shift=?,

                machine_no=?,

                total_time=?,

                actual_time=?,

                deduction_time=?,

                product_name=?,

                standard_output=?,

                actual_output=?,

                tt_ok=?,

                tt_ng=?,

                kqd_dap_lai=?,

                kqd_tuot=?,

                vo_do_long=?,

                xuoc_do_long=?,

                cong_gay=?,

                xoay=?,

                khong_dut=?,

                bavia_hut=?,

                ppcm=?,

                loi_cao_su=?,

                ng_kich_thuoc=?,

                cat_lem=?,

                note=?,

                status='pending'


            WHERE id=?


            `;



            db.query(

                sql,

                [

                    data.process_id,

                    data.work_date,

                    data.shift,

                    data.machine_no,

                    data.total_time,

                    data.actual_time,

                    data.deduction_time,

                    data.product_name,

                    data.standard_output,

                    data.actual_output,

                    data.tt_ok,

                    data.tt_ng,

                    data.kqd_dap_lai,

                    data.kqd_tuot,

                    data.vo_do_long,

                    data.xuoc_do_long,

                    data.cong_gay,

                    data.xoay,

                    data.khong_dut,

                    data.bavia_hut,

                    data.ppcm,

                    data.loi_cao_su,

                    data.ng_kich_thuoc,

                    data.cat_lem,

                    data.note,

                    id

                ],


                (err,result)=>{


                    if(err)
                        return reject(err);


                    resolve(result);


                }


            );


        });


    },









    // ==========================
    // DUYỆT THEO NGÀY
    // TEMP -> PRODUCTION
    // ==========================

    approveByDate(date,manager_id){


        return new Promise((resolve,reject)=>{


            db.beginTransaction(err=>{


                if(err)
                    return reject(err);



                const selectSql = `

                SELECT *

                FROM production_reports_temp

                WHERE DATE(work_date)=?

                AND status='pending'


                `;



                db.query(

                    selectSql,

                    [date],


                    (err,rows)=>{


                        if(err)
                            return db.rollback(
                                ()=>reject(err)
                            );



                        if(rows.length===0){

                            return db.rollback(
                                ()=>reject(
                                    new Error(
                                        "Không có báo cáo chờ duyệt"
                                    )
                                )
                            );

                        }





                        const insertSql = `

                        INSERT INTO production_reports

                        (

                            worker_id,
                            process_id,

                            work_date,
                            shift,
                            machine_no,

                            total_time,
                            actual_time,
                            deduction_time,

                            product_name,

                            standard_output,
                            actual_output,

                            tt_ok,
                            tt_ng,

                            kqd_dap_lai,
                            kqd_tuot,

                            vo_do_long,
                            xuoc_do_long,

                            cong_gay,
                            xoay,

                            khong_dut,
                            bavia_hut,

                            ppcm,
                            loi_cao_su,

                            ng_kich_thuoc,
                            cat_lem,

                            note

                        )

                        VALUES ?

                        `;



                        const values = rows.map(item=>[


                            item.worker_id,
                            item.process_id,


                            item.work_date,
                            item.shift,
                            item.machine_no,


                            item.total_time,
                            item.actual_time,
                            item.deduction_time,


                            item.product_name,


                            item.standard_output,
                            item.actual_output,


                            item.tt_ok,
                            item.tt_ng,


                            item.kqd_dap_lai,
                            item.kqd_tuot,


                            item.vo_do_long,
                            item.xuoc_do_long,


                            item.cong_gay,
                            item.xoay,


                            item.khong_dut,
                            item.bavia_hut,


                            item.ppcm,
                            item.loi_cao_su,


                            item.ng_kich_thuoc,
                            item.cat_lem,


                            item.note


                        ]);





                        db.query(

                            insertSql,

                            [values],


                            (err)=>{


                                if(err)

                                    return db.rollback(
                                        ()=>reject(err)
                                    );






                                const deleteSql = `

                                UPDATE production_reports_temp
SET
status='approved',
reviewed_by=?,
approved_at=NOW()
WHERE DATE(work_date)=?
AND status='pending'


                                `;



                                db.query(

                                    deleteSql,

                                    [date],


                                    (err)=>{


                                        if(err)

                                            return db.rollback(
                                                ()=>reject(err)
                                            );





                                        db.commit(err=>{


                                            if(err)

                                                return db.rollback(
                                                    ()=>reject(err)
                                                );



                                            resolve(true);



                                        });



                                    }


                                );



                            }


                        );



                    }


                );



            });



        });


    },









    // ==========================
    // WORKER XEM LỊCH SỬ TEMP
    // ==========================

    getByWorker(worker_id){


        return new Promise((resolve,reject)=>{


            const sql = `


            SELECT

                pr.*,

                p.process_name,

                w.worker_code,

                u.full_name


            FROM production_reports_temp pr


            INNER JOIN workers w
            ON pr.worker_id=w.id


            INNER JOIN users u
            ON w.user_id=u.id


            LEFT JOIN processes p
            ON pr.process_id=p.id


            WHERE pr.worker_id=?


            ORDER BY pr.created_at DESC


            `;



            db.query(

                sql,

                [worker_id],

                (err,rows)=>{


                    if(err)
                        return reject(err);


                    resolve(rows);


                }


            );


        });


    },

    // ======================================
// LẤY DANH SÁCH NGÀY CÓ BÁO CÁO CHỜ DUYỆT
// ======================================

getDates(){


    return new Promise((resolve,reject)=>{


        const sql = `

        SELECT DISTINCT

            DATE(work_date) AS date


        FROM production_reports_temp


        ORDER BY date DESC


        `;



        db.query(sql,(err,rows)=>{


            if(err)

                return reject(err);



            resolve(rows);



        });



    });


},







// ======================================
// MANAGER LẤY BÁO CÁO THEO NGÀY
// ======================================

getByDate(date){


    return new Promise((resolve,reject)=>{


        const sql = `


        SELECT


            pr.*,


            p.process_name,


            w.worker_code,


            u.full_name



        FROM production_reports_temp pr



        INNER JOIN workers w

        ON pr.worker_id=w.id



        INNER JOIN users u

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



},







// ======================================
// DUYỆT TOÀN BỘ BÁO CÁO TRONG NGÀY
// TEMP -> PRODUCTION
// ======================================

approveByDate(date,manager_id){


    return new Promise((resolve,reject)=>{


        db.beginTransaction(err=>{


            if(err)

                return reject(err);




            const selectSql = `


            SELECT *

            FROM production_reports_temp

            WHERE DATE(work_date)=?


            `;



            db.query(

                selectSql,

                [date],

                (err,rows)=>{


                    if(err)

                        return db.rollback(
                            ()=>reject(err)
                        );




                    if(rows.length===0){


                        return db.rollback(
                            ()=>reject(
                                new Error(
                                    "Không có báo cáo ngày này"
                                )
                            )
                        );


                    }






                    const values = rows.map(item=>[


                        item.worker_id,

                        item.process_id,


                        item.work_date,

                        item.shift,

                        item.machine_no,


                        item.total_time,

                        item.actual_time,

                        item.deduction_time,


                        item.product_name,


                        item.standard_output,

                        item.actual_output,


                        item.tt_ok,

                        item.tt_ng,


                        item.kqd_dap_lai,

                        item.kqd_tuot,


                        item.vo_do_long,

                        item.xuoc_do_long,


                        item.cong_gay,

                        item.xoay,


                        item.khong_dut,

                        item.bavia_hut,


                        item.ppcm,

                        item.loi_cao_su,


                        item.ng_kich_thuoc,

                        item.cat_lem,


                        item.note



                    ]);







                    const insertSql = `


                    INSERT INTO production_reports


                    (

                    worker_id,

                    process_id,


                    work_date,

                    shift,

                    machine_no,


                    total_time,

                    actual_time,

                    deduction_time,


                    product_name,


                    standard_output,

                    actual_output,


                    tt_ok,

                    tt_ng,


                    kqd_dap_lai,

                    kqd_tuot,


                    vo_do_long,

                    xuoc_do_long,


                    cong_gay,

                    xoay,


                    khong_dut,

                    bavia_hut,


                    ppcm,

                    loi_cao_su,


                    ng_kich_thuoc,

                    cat_lem,


                    note

                    )



                    VALUES ?



                    `;







                    db.query(

                        insertSql,

                        [values],

                        (err)=>{


                            if(err)

                                return db.rollback(
                                    ()=>reject(err)
                                );







                            db.query(

                                `

                                DELETE FROM production_reports_temp

                                WHERE DATE(work_date)=?

                                `,


                                [date],


                                (err)=>{


                                    if(err)

                                        return db.rollback(
                                            ()=>reject(err)
                                        );




                                    db.commit(err=>{


                                        if(err)

                                            return db.rollback(
                                                ()=>reject(err)
                                            );



                                        resolve(true);



                                    });



                                }


                            );



                        }


                    );



                }


            );



        });



    });



},


// ======================================
// LẤY BÁO CÁO CHƯA DUYỆT
// ======================================

getPending(){


    return new Promise((resolve,reject)=>{


        const sql = `

        SELECT

            pr.*,

            p.process_name,

            w.worker_code,

            u.full_name


        FROM production_reports_temp pr


        INNER JOIN workers w
        ON pr.worker_id=w.id


        INNER JOIN users u
        ON w.user_id=u.id


        LEFT JOIN processes p
        ON pr.process_id=p.id


        WHERE pr.status='pending'


        ORDER BY pr.created_at DESC


        `;


        db.query(sql,(err,rows)=>{


            if(err)
                return reject(err);


            resolve(rows);


        });


    });


},





// ======================================
// LẤY BÁO CÁO ĐÃ DUYỆT
// ======================================

getApproved(){


    return new Promise((resolve,reject)=>{


        const sql = `

        SELECT

            pr.*,

            p.process_name,

            w.worker_code,

            u.full_name


        FROM production_reports_temp pr


        INNER JOIN workers w
        ON pr.worker_id=w.id


        INNER JOIN users u
        ON w.user_id=u.id


        LEFT JOIN processes p
        ON pr.process_id=p.id


        WHERE pr.status='approved'


        ORDER BY pr.approved_at DESC


        `;


        db.query(sql,(err,rows)=>{


            if(err)
                return reject(err);


            resolve(rows);


        });


    });


},

// ======================================
// LẤY BÁO CÁO CHƯA DUYỆT
// ======================================

getPending(){

    return new Promise((resolve,reject)=>{


        const sql = `

        SELECT

            pr.*,

            p.process_name,

            w.worker_code,

            u.full_name


        FROM production_reports_temp pr


        INNER JOIN workers w
        ON pr.worker_id=w.id


        INNER JOIN users u
        ON w.user_id=u.id


        LEFT JOIN processes p
        ON pr.process_id=p.id


        WHERE pr.status='pending'


        ORDER BY pr.work_date DESC,
                 pr.created_at DESC

        `;


        db.query(sql,(err,rows)=>{

            if(err)
                return reject(err);


            resolve(rows);

        });


    });

},





// ======================================
// LẤY BÁO CÁO ĐÃ DUYỆT
// ======================================

getApproved(){

    return new Promise((resolve,reject)=>{


        const sql = `

        SELECT

            pr.*,

            p.process_name,

            w.worker_code,

            u.full_name


        FROM production_reports pr


        INNER JOIN workers w
        ON pr.worker_id=w.id


        INNER JOIN users u
        ON w.user_id=u.id


        LEFT JOIN processes p
        ON pr.process_id=p.id


        ORDER BY pr.work_date DESC,
                 pr.created_at DESC

        `;


        db.query(sql,(err,rows)=>{

            if(err)
                return reject(err);


            resolve(rows);

        });


    });

},
};



module.exports = ProductionTemp;