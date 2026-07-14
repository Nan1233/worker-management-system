const {google}=require("googleapis");

const ReportService=require("./reportService");

const GoogleSheetModel=require("../models/googleSheetModel");




// Render dùng ENV

const credentials =
JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT
);



const auth = new google.auth.GoogleAuth({


    credentials,


    scopes:[

        "https://www.googleapis.com/auth/spreadsheets"

    ]


});







exports.syncProductionReport = async(date)=>{


    // ==========================
    // lấy dữ liệu báo cáo
    // ==========================


    const reports =
    await ReportService.getApprovedReportsByDate(date);





    const client =
    await auth.getClient();



    const sheets =
    google.sheets({

        version:"v4",

        auth:client

    });





    let sheetInfo =
    await GoogleSheetModel.findByDate(date);





    let spreadsheetId;






    // ==========================
    // chưa có sheet
    // ==========================

    if(!sheetInfo){



        const create =
        await sheets.spreadsheets.create({


            requestBody:{


                properties:{


                    title:
                    `Bao cao san xuat ${date}`


                }


            }


        });



        spreadsheetId =
        create.data.spreadsheetId;





        const url =
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;






        await GoogleSheetModel.create({

            report_date:date,

            spreadsheet_id:spreadsheetId,

            spreadsheet_url:url

        });



    }

    else{


        spreadsheetId =
        sheetInfo.spreadsheet_id;


    }








    // ==========================
    // dữ liệu ghi sheet
    // ==========================


    const values=[


        [

            "STT",

            "Mã CN",

            "Tên CN",

            "Công đoạn",

            "Ngày",

            "Ca",

            "Máy",

            "Sản phẩm",

            "SL chuẩn",

            "SL thực tế",

            "OK",

            "NG",

            "Trạng thái",

            "Ghi chú"


        ]

    ];







    reports.forEach((item,index)=>{


        values.push([


            index+1,

            item.worker_code,

            item.full_name,

            item.process_name,

            item.work_date,

            item.shift,

            item.machine_no,

            item.product_name,

            item.standard_output,

            item.actual_output,

            item.tt_ok,

            item.tt_ng,

            item.status,

            item.note


        ]);



    });








    // ==========================
    // xóa dữ liệu cũ
    // ==========================


    await sheets.spreadsheets.values.clear({


        spreadsheetId,


        range:"Sheet1"



    });







    // ==========================
    // ghi dữ liệu mới
    // ==========================


    await sheets.spreadsheets.values.update({



        spreadsheetId,


        range:"Sheet1!A1",


        valueInputOption:"RAW",


        requestBody:{


            values


        }



    });







    return {


        spreadsheetId,


        url:
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}`


    };



};