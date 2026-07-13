const ExcelJS = require("exceljs");
const db = require("../config/db");



exports.exportGiaCongExcel = async(req,res)=>{


    try{


        const date =
            req.query.date;


        const type =
            req.query.type || "temp";



        if(!date){


            return res.status(400).json({

                message:"Thiếu ngày xuất báo cáo"

            });


        }




        let table = "";



        if(type==="approved"){

            table = "production_reports";

        }
        else{

            table = "production_reports_temp";

        }






        const sql = `

        SELECT

        t.*,

        w.worker_code,

        u.full_name,

        p.process_name


        FROM ${table} t


        LEFT JOIN workers w

        ON t.worker_id=w.id


        LEFT JOIN users u

        ON w.user_id=u.id


        LEFT JOIN processes p

        ON t.process_id=p.id


        WHERE DATE(t.work_date)=?


        ORDER BY t.id ASC


        `;





        const [rows] =
            await db.promise().query(

                sql,

                [date]

            );





        const workbook =
            new ExcelJS.Workbook();



        const sheet =
            workbook.addWorksheet(
                "Gia công"
            );







        sheet.mergeCells(
            "A1:AD1"
        );


        sheet.getCell("A1").value =
            type==="approved"
            ?
            "BÁO CÁO GIA CÔNG ĐÃ DUYỆT"
            :
            "BÁO CÁO GIA CÔNG CHỜ DUYỆT";



        sheet.getCell("A1").font={

            bold:true,

            size:16

        };



        sheet.getCell("A1").alignment={

            horizontal:"center"

        };







        const headers=[


            "STT",

            "Mã CN",

            "Họ tên",

            "Công đoạn",

            "Ngày",

            "Ca",

            "Máy",


            "Tổng TG",

            "TG thực tế",

            "TG trừ",


            "Sản phẩm",


            "Kế hoạch",

            "Thực tế",


            "OK",

            "NG",


            "Dập lại",

            "Tuột",


            "Vỡ dò lòng",

            "Xước dò lòng",


            "Cọng gãy",

            "Xoay",


            "Không đứt",

            "Bavia hút",


            "PPCM",

            "Lỗi cao su",


            "NG kích thước",

            "Cắt lem",


            "Ghi chú",


            "Trạng thái",


            "Thời gian tạo"


        ];





        sheet.getRow(2).values =
            headers;




        rows.forEach((item,index)=>{


            sheet.getRow(index+3).values=[


                index+1,


                item.worker_code || "",


                item.full_name || "",


                item.process_name || "",


                item.work_date || "",


                item.shift || "",


                item.machine_no || "",



                item.total_time || 0,


                item.actual_time || 0,


                item.deduction_time || 0,



                item.product_name || "",



                item.standard_output || 0,


                item.actual_output || 0,



                item.tt_ok || 0,


                item.tt_ng || 0,



                item.kqd_dap_lai || 0,


                item.kqd_tuot || 0,



                item.vo_do_long || 0,


                item.xuoc_do_long || 0,



                item.cong_gay || 0,


                item.xoay || 0,



                item.khong_dut || 0,


                item.bavia_hut || 0,



                item.ppcm || 0,


                item.loi_cao_su || 0,



                item.ng_kich_thuoc || 0,


                item.cat_lem || 0,



                item.note || "",


                item.status || 
                (
                    type==="approved"
                    ?
                    "approved"
                    :
                    "pending"
                ),



                item.created_at || ""


            ];


        });







        sheet.eachRow(row=>{


            row.eachCell(cell=>{


                cell.alignment={

                    horizontal:"center",

                    vertical:"middle",

                    wrapText:true

                };


                cell.border={

                    top:{
                        style:"thin"
                    },

                    bottom:{
                        style:"thin"
                    },

                    left:{
                        style:"thin"
                    },

                    right:{
                        style:"thin"
                    }

                };


            });


        });





        sheet.columns.forEach(col=>{

            col.width=15;

        });





        res.setHeader(

            "Content-Type",

            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

        );



        res.setHeader(

            "Content-Disposition",

            `attachment; filename=BaoCao_${type}_${date}.xlsx`

        );




        await workbook.xlsx.write(res);


        res.end();



    }
    catch(err){


        console.error(
            "EXPORT ERROR:",
            err
        );



        res.status(500).json({

            message:err.message

        });


    }


};