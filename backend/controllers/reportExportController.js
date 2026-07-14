const ExcelJS = require("exceljs");
const db = require("../config/db");


// =====================================================
// XUẤT EXCEL GIA CÔNG THEO NGÀY
// GET /api/reports/export-excel?date=2026-07-01&type=approved
// =====================================================

exports.exportGiaCongExcel = async (req, res) => {

    try {

        const date = req.query.date;
        const type = req.query.type;


        if (!date) {

            return res.status(400).json({

                success:false,

                message:"Thiếu ngày xuất báo cáo"

            });

        }



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


            pr.total_time,

            pr.actual_time,

            pr.deduction_time,


            pr.standard_output,

            pr.actual_output,


            pr.tt_ok,

            pr.tt_ng,


            pr.note,

            pr.status,

            pr.review_note,

            pr.approved_at,

            pr.created_at



        FROM production_reports pr



        INNER JOIN workers w

        ON pr.worker_id = w.id



        INNER JOIN users u

        ON w.user_id = u.id



        LEFT JOIN processes p

        ON pr.process_id = p.id



        WHERE DATE(pr.work_date)=?



        ${
            type === "approved"
            ? "AND pr.status='approved'"
            : ""
        }


        ${
            type === "pending"
            ? "AND pr.status='pending'"
            : ""
        }



        ORDER BY pr.created_at ASC



        `;



        db.query(

            sql,

            [date],

            async(err, rows)=>{


                if(err){

                    console.error(err);

                    return res.status(500).json({

                        success:false,

                        message:err.message

                    });

                }



                const workbook =
                    new ExcelJS.Workbook();



                const sheet =
                    workbook.addWorksheet(
                        "Gia Cong"
                    );



                sheet.columns = [


                    {
                        header:"STT",
                        key:"stt",
                        width:8
                    },


                    {
                        header:"Mã CN",
                        key:"worker_code",
                        width:15
                    },


                    {
                        header:"Tên CN",
                        key:"full_name",
                        width:20
                    },


                    {
                        header:"Công đoạn",
                        key:"process_name",
                        width:20
                    },


                    {
                        header:"Ngày",
                        key:"work_date",
                        width:15
                    },


                    {
                        header:"Ca",
                        key:"shift",
                        width:10
                    },


                    {
                        header:"Máy",
                        key:"machine_no",
                        width:12
                    },


                    {
                        header:"Sản phẩm",
                        key:"product_name",
                        width:25
                    },


                    {
                        header:"SL chuẩn",
                        key:"standard_output",
                        width:12
                    },


                    {
                        header:"SL thực tế",
                        key:"actual_output",
                        width:12
                    },


                    {
                        header:"OK",
                        key:"tt_ok",
                        width:10
                    },


                    {
                        header:"NG",
                        key:"tt_ng",
                        width:10
                    },


                    {
                        header:"Trạng thái",
                        key:"status",
                        width:15
                    },


                    {
                        header:"Ghi chú",
                        key:"note",
                        width:30
                    }


                ];





                rows.forEach((item,index)=>{


                    sheet.addRow({

                        stt:index+1,

                        worker_code:item.worker_code,

                        full_name:item.full_name,

                        process_name:item.process_name,

                        work_date:item.work_date,

                        shift:item.shift,

                        machine_no:item.machine_no,

                        product_name:item.product_name,

                        standard_output:item.standard_output,

                        actual_output:item.actual_output,

                        tt_ok:item.tt_ok,

                        tt_ng:item.tt_ng,

                        status:item.status,

                        note:item.note


                    });


                });





                sheet.getRow(1).font = {

                    bold:true

                };





                res.setHeader(

                    "Content-Type",

                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

                );



                res.setHeader(

                    "Content-Disposition",

                    `attachment; filename=gia-cong-${type || "all"}-${date}.xlsx`

                );





                await workbook.xlsx.write(res);


                res.end();



            }

        );



    }


    catch(err){


        console.error(err);


        res.status(500).json({

            success:false,

            message:err.message

        });


    }


};