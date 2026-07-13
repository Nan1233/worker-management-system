const ExcelJS = require("exceljs");
const db = require("../config/db");



exports.exportProductionExcel = async(req,res)=>{


    try{


        const month =
            req.query.month || "04";


        const year =
            req.query.year || "2026";



        const sql = `

        SELECT *

        FROM production_reports

        WHERE MONTH(work_date)=?

        AND YEAR(work_date)=?

        ORDER BY work_date ASC

        `;



        db.query(
            sql,
            [
                month,
                year
            ],

            async(err,rows)=>{


                if(err){

                    return res.status(500)
                    .json({

                        success:false,

                        message:err.message

                    });

                }




                const workbook =
                    new ExcelJS.Workbook();



                const worksheet =
                    workbook.addWorksheet(
                        "EP"
                    );




                // =========================
                // CỘT CỐ ĐỊNH A-V
                // =========================


                const headers=[


                    "STT",

                    "SHOT/THÁNG",

                    "Số cav/ khuôn",

                    "Thời gian",

                    "MÃ SP",

                    "Mã SP",

                    "KH",

                    "TT",

                    "% Thực tích",

                    "Shotl/H",

                    "SL/H",

                    "TỔNG PP",

                    "Chân không",

                    "Rách vỡ",

                    "Thiếu liệu",

                    "Dính via",

                    "Di vật",

                    "Dính khuôn",

                    "Tạp chất"


                ];




                headers.forEach(
                    (title,index)=>{


                        const col=index+1;


                        worksheet.mergeCells(
                            1,
                            col,
                            2,
                            col
                        );


                        worksheet
                        .getCell(
                            1,
                            col
                        )
                        .value=title;


                    }
                );





                // =========================
                // NGÀY THÁNG W -> 
                // =========================


                let start=23;



                for(
                    let day=1;
                    day<=31;
                    day++
                ){


                    let col =
                    start+
                    (day-1)*3;



                    worksheet.mergeCells(
                        1,
                        col,
                        1,
                        col+2
                    );



                    worksheet
                    .getCell(
                        1,
                        col
                    )
                    .value =
                    `${day}/${month}/${year}`;



                    worksheet
                    .getCell(
                        2,
                        col
                    )
                    .value="OK";



                    worksheet
                    .getCell(
                        2,
                        col+1
                    )
                    .value="NG";



                    worksheet
                    .getCell(
                        2,
                        col+2
                    )
                    .value="%";


                }





                // =========================
                // STYLE HEADER
                // =========================


                worksheet.eachRow(
                    row=>{


                        row.eachCell(
                            cell=>{


                                if(
                                    row.number<=2
                                ){


                                    cell.font={

                                        bold:true

                                    };


                                    cell.alignment={

                                        horizontal:"center",

                                        vertical:"middle"

                                    };



                                    cell.fill={

                                        type:"pattern",

                                        pattern:"solid",

                                        fgColor:{
                                            argb:"FFD9EAF7"
                                        }

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


                                }


                            }
                        )


                    }
                );





                // Freeze

                worksheet.views=[

                    {

                        state:"frozen",

                        xSplit:22,

                        ySplit:2

                    }

                ];






                // =========================
                // DATA
                // =========================


                rows.forEach(
                    (item,index)=>{


                        let row =
                        worksheet.getRow(
                            index+3
                        );



                        row.getCell(1)
                        .value=index+1;



                        row.getCell(5)
                        .value=
                        item.product_name;



                        row.getCell(12)
                        .value=
                        item.actual_output;




                        let day =
                        new Date(
                            item.work_date
                        )
                        .getDate();



                        let col =
                        23+
                        (day-1)*3;



                        row.getCell(col)
                        .value=
                        item.tt_ok;



                        row.getCell(col+1)
                        .value=
                        item.tt_ng;



                        row.getCell(col+2)
                        .value=
                        item.tt_ok /
                        (
                            item.tt_ok+
                            item.tt_ng
                        ) || 0;



                    }
                );






                worksheet.columns.forEach(
                    column=>{


                        column.width=15;


                    }
                );





                res.setHeader(

                    "Content-Type",

                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

                );



                res.setHeader(

                    "Content-Disposition",

                    `attachment; filename=EP_${month}_${year}.xlsx`

                );





                await workbook.xlsx.write(
                    res
                );


                res.end();


            }
        );



    }

    catch(err){


        res.status(500)
        .json({

            success:false,

            message:err.message

        });


    }


};