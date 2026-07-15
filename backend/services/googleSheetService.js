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
// GOOGLE SHEET CỐ ĐỊNH
// LẤY TỪ RENDER ENV
// =====================================================

const spreadsheetId =
process.env.GOOGLE_SPREADSHEET_ID;





// =====================================================
// SYNC PRODUCTION REPORT
// =====================================================

exports.syncProductionReport = async(date)=>{


    try{


        const reports =
        await ReportService.getApprovedReportsByDate(date);



        const client =
        await auth.getClient();



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
// GIỮ TƯƠNG THÍCH CONTROLLER
// KHÔNG TẠO FILE MỚI
// CHỈ GHI VÀO FILE CỐ ĐỊNH
// =====================================================

exports.createSheet = async(date)=>{


    return exports.syncProductionReport(date);


};







// =====================================================
// UPDATE SHEET
// =====================================================

exports.updateSheet = async(date)=>{


    return exports.syncProductionReport(date);


};








// =====================================================
// WRITE DATA
// =====================================================

const writeSheetData = async(

    sheets,

    reports

)=>{


    const values = [


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


            index + 1,


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


            item.note || ""

        ]);


    });







    // XÓA DỮ LIỆU CŨ

    await sheets.spreadsheets.values.clear({


        spreadsheetId,


        range:"Cắt lồng!A1:Z1000"


    });







    // GHI DỮ LIỆU MỚI

    await sheets.spreadsheets.values.update({


        spreadsheetId,


        range:"Cắt lồng!A1",


        valueInputOption:"RAW",


        requestBody:{


            values


        }


    });


};