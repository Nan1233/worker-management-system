const {google}=require("googleapis");

const ReportService=require("./reportService");



const spreadsheetId =
process.env.GOOGLE_SHEET_ID;



const auth = new google.auth.GoogleAuth({

    keyFile:"google-service-account.json",

    scopes:[
        "https://www.googleapis.com/auth/spreadsheets"
    ]

});



exports.syncProductionReport = async(date)=>{


    const reports =
    await ReportService.getApprovedReportsByDate(date);



    const client =
    await auth.getClient();



    const sheets =
    google.sheets({

        version:"v4",

        auth:client

    });



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



    await sheets.spreadsheets.values.update({


        spreadsheetId,


        range:"Gia Cong!A1",


        valueInputOption:"RAW",


        requestBody:{


            values


        }


    });



    return true;


};