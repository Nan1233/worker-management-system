const db = require("../config/db");


const ProductionTemp = {


    create(data) {

        return new Promise((resolve, reject) => {


            const sql = `

            INSERT INTO production_reports_temp(

                worker_id,
                process_type,
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


            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)

            `;



            db.query(sql,[


                data.worker_id,

                data.process_type,

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


            ],(err,result)=>{


                if(err){

                    return reject(err);

                }


                resolve(result);


            });


        });


    },





    getAll(){


        return new Promise((resolve,reject)=>{


            const sql = `

            SELECT

                pr.id,

                pr.process_type,

                pr.work_date,

                pr.shift,

                pr.machine_no,

                pr.product_name,

                pr.standard_output,

                pr.actual_output,

                pr.tt_ok,

                pr.tt_ng,

                pr.created_at,


                w.worker_code,

                u.full_name


            FROM production_reports_temp pr


            INNER JOIN workers w

                ON pr.worker_id = w.id


            INNER JOIN users u

                ON w.user_id = u.id


            ORDER BY pr.created_at DESC


            `;



            db.query(sql,(err,rows)=>{


                if(err){

                    return reject(err);

                }


                resolve(rows);


            });



        });


    },






    getById(id){


        return new Promise((resolve,reject)=>{


            const sql = `


            SELECT

                pr.*,

                w.worker_code,

                u.full_name


            FROM production_reports_temp pr


            INNER JOIN workers w

                ON pr.worker_id=w.id


            INNER JOIN users u

                ON w.user_id=u.id


            WHERE pr.id=?


            `;



            db.query(sql,[id],(err,rows)=>{


                if(err){

                    return reject(err);

                }


                resolve(rows[0]);


            });


        });


    }





};


module.exports = ProductionTemp;