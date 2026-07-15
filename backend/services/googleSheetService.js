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
// SYNC PRODUCTION REPORT
// =====================================================

exports.syncProductionReport = async(date)=>{


    try{


        if(!spreadsheetId){

            throw new Error(
                "Thiếu GOOGLE_SPREADSHEET_ID"
            );

        }



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
            "REPORT DATE:",
            date
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

            spreadsheetId,

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
// GIỮ COMPATIBLE CONTROLLER
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
// WRITE DATA
// =====================================================

const writeSheetData = async(

    sheets,

    spreadsheetId,

    reports

)=>{


    if(!reports || reports.length === 0){


        throw new Error(

            "Không có dữ liệu approved để ghi Google Sheet"

        );


    }




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


            item.worker_code || "",


            item.full_name || "",


            item.process_name || "",


            item.work_date || "",


            item.shift || "",


            item.machine_no || "",


            item.product_name || "",


            item.standard_output || 0,


            item.actual_output || 0,


            item.tt_ok || 0,


            item.tt_ng || 0,


            item.status || "",


            item.note || ""



        ]);


    });





    console.log(

        "ROWS WRITE:",

        values.length

    );





    // =====================================================
    // KIỂM TRA TAB GOOGLE SHEET
    // =====================================================


    const meta =
    await sheets.spreadsheets.get({

        spreadsheetId

    });



    console.log(

        "AVAILABLE SHEETS:",

        meta.data.sheets.map(

            s=>s.properties.title

        )

    );





    // =====================================================
    // GHI DỮ LIỆU
    // KHÔNG CLEAR TRƯỚC
    // =====================================================


    await sheets.spreadsheets.values.update({


        spreadsheetId,


        range:"Cắt lồng!A1",


        valueInputOption:"RAW",


        requestBody:{


            values


        }


    });





    console.log(

        "WRITE GOOGLE SHEET SUCCESS"

    );


};