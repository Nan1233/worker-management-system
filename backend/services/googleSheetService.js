const { google } = require("googleapis");

const ReportService = require("./reportService");


// =====================================================
// GOOGLE AUTH
// =====================================================

const credentials = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT
);



const auth = new google.auth.GoogleAuth({

    credentials,

    scopes:[

        "https://www.googleapis.com/auth/spreadsheets"

    ]

});




// =====================================================
// GOOGLE SHEET ID
// =====================================================

const spreadsheetId =
process.env.GOOGLE_SPREADSHEET_ID;




// =====================================================
// SYNC REPORT
// =====================================================

exports.syncProductionReport = async(date)=>{


    try{


        const reports =
        await ReportService.getApprovedReportsByDate(date);



        console.log(
            "========== GOOGLE SHEET =========="
        );


        console.log(
            "SERVICE ACCOUNT:",
            credentials.client_email
        );


        console.log(
            "SPREADSHEET ID:",
            spreadsheetId
        );


        console.log(
            "REPORT COUNT:",
            reports.length
        );




        const client =
        await auth.getClient();



        const sheets =
        google.sheets({

            version:"v4",

            auth:client

        });





        await writeSheetData(

            sheets,

            reports

        );




        return {

            spreadsheetId,

            url:
            `https://docs.google.com/spreadsheets/d/${spreadsheetId}`

        };


    }
    catch(err){


        console.error(
            "SYNC GOOGLE SHEET ERROR"
        );


        console.error(err);


        throw err;


    }


};






// =====================================================
// CREATE SHEET
// CONTROLLER GỌI
// =====================================================

exports.createSheet = async(date)=>{


    return await exports.syncProductionReport(date);


};






// =====================================================
// UPDATE SHEET
// =====================================================

exports.updateSheet = async(date)=>{


    return await exports.syncProductionReport(date);


};








// =====================================================
// ĐỌC DATA GOOGLE SHEET
// =====================================================

const getSheetData = async(sheets)=>{


    const result =
    await sheets.spreadsheets.values.get({


        spreadsheetId,


        range:
        "Cắt lồng!A:ZZ"


    });



    return result.data.values || [];


};










// =====================================================
// GHI DATA KHÔNG GHI ĐÈ TOÀN BỘ
// =====================================================

const writeSheetData = async(

    sheets,

    reports

)=>{


    if(!reports || reports.length===0){


        throw new Error(
            "Không có dữ liệu approved"
        );

    }



    // lấy dữ liệu hiện tại

    const oldData =
    await getSheetData(sheets);




    console.log(
        "OLD ROW:",
        oldData.length
    );





    const header = oldData[0] || [

        "STT",
        "Mã nhân viên",
        "Tên",
        "Số máy",
        "Ca",
        "% học việc",
        "Thời gian làm việc",
        "Số lần CM",
        "Tổng TG trừ giờ",
        "Thiếu sản lượng",
        "Bật máy, xét máy",
        "Chuyển mã",
        "Chỉnh máy",
        "Chờ chỉnh máy",
        "Mất điện",
        "Mất khí",
        "Chờ hàng",
        "Bảo dưỡng máy",
        "Nghỉ giải lao",
        "Giao ca",
        "Dừng máy đi hỗ trợ",
        "SP",
        "Định mức",
        "TT",
        "Ngày/Tháng",
        "OK",
        "Tổng NG",
        "Trạng thái"

    ];






    // map mã nhân viên -> dòng

    const employeeMap = {};



    oldData.forEach((row,index)=>{


        if(index===0)
            return;



        const code =
        row[1];


        if(code){


            employeeMap[code]=index+1;


        }


    });






    let appendRows=[];



    for(const item of reports){



        const row = [



            "",

            item.worker_code || "",

            item.full_name || "",

            item.machine_no || "",

            item.shift || "",


            "",


            "",


            "",


            "",


            "",


            "",


            "",


            "",


            "",


            "",


            "",


            "",


            "",


            "",


            "",


            "",



            item.product_name || "",


            item.standard_output || "",


            item.actual_output || "",



            item.work_date || "",



            item.tt_ok || "",



            item.tt_ng || "",



            item.status || ""



        ];





        const existRow =
        employeeMap[item.worker_code];




        if(existRow){



            console.log(

                "UPDATE ROW",

                item.worker_code,

                existRow

            );



            await sheets.spreadsheets.values.update({


                spreadsheetId,


                range:
                `Cắt lồng!A${existRow}`,


                valueInputOption:"RAW",


                requestBody:{


                    values:[row]

                }


            });



        }
        else{



            console.log(

                "APPEND",

                item.worker_code

            );



            appendRows.push(row);



        }


    }







    // thêm nhân viên mới

    if(appendRows.length>0){



        await sheets.spreadsheets.values.append({



            spreadsheetId,


            range:
            "Cắt lồng!A1",



            valueInputOption:"RAW",



            insertDataOption:"INSERT_ROWS",



            requestBody:{


                values:appendRows


            }


        });


    }







    // nếu sheet chưa có tiêu đề

    if(oldData.length===0){



        await sheets.spreadsheets.values.update({



            spreadsheetId,


            range:
            "Cắt lồng!A1",


            valueInputOption:"RAW",


            requestBody:{


                values:[header]

            }


        });


    }





    console.log(
        "GOOGLE SHEET UPDATE SUCCESS"
    );


};