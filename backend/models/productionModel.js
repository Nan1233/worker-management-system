const db = require("../config/db");


const Production = {


// =================================
// TẠO BÁO CÁO ĐÃ DUYỆT
// =================================

create(data){

    return new Promise((resolve,reject)=>{


        const sql = `

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

        VALUES
        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)

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

                data.note

            ],

            (err,result)=>{


                if(err)
                    return reject(err);


                resolve(result);


            }
        );


    });


},




// =================================
// LẤY TẤT CẢ
// =================================

getAll(){


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


        ORDER BY

            pr.work_date DESC,

            pr.created_at DESC


        `;


        db.query(sql,(err,rows)=>{


            if(err)
                return reject(err);


            resolve(rows);


        });


    });


},





// =================================
// LẤY DANH SÁCH NGÀY
// =================================

getDates(){


    return new Promise((resolve,reject)=>{


        const sql = `


        SELECT DISTINCT

            DATE(work_date) AS date


        FROM production_reports


        ORDER BY date DESC


        `;



        db.query(sql,(err,rows)=>{


            if(err)
                return reject(err);


            resolve(rows);


        });


    });


},





// =================================
// LẤY THEO NGÀY
// =================================

getByDate(date){


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


        WHERE pr.work_date = ?


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





// =================================
// CHI TIẾT
// =================================

getById(id){


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





// =================================
// UPDATE
// =================================

update(id,data){


    return new Promise((resolve,reject)=>{


        const sql = `


        UPDATE production_reports

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


            note=?


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





// =================================
// DELETE
// =================================

delete(id){


    return new Promise((resolve,reject)=>{


        db.query(

            `
            DELETE FROM production_reports
            WHERE id=?
            `,

            [id],

            (err,result)=>{


                if(err)
                    return reject(err);


                resolve(result);


            }

        );


    });


}



};



module.exports = Production;