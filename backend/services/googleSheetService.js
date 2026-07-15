const { google } = require("googleapis");

const ReportService = require("./reportService");
const GoogleSheetModel = require("../models/googleSheetModel");


// =====================================================
// GOOGLE AUTH
// =====================================================

const credentials = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT
);


const auth = new google.auth.GoogleAuth({

    credentials,

    scopes: [

        "https://www.googleapis.com/auth/spreadsheets",

        "https://www.googleapis.com/auth/drive"

    ]

});




// =====================================================
// COPY GOOGLE SHEET TEMPLATE
// =====================================================

const createSpreadsheet = async (title)=>{


    const client =
        await auth.getClient();



    const drive =
        google.drive({

            version:"v3",

            auth:client

        });



    const copy =
        await drive.files.copy({

            fileId:
            process.env.GOOGLE_TEMPLATE_SHEET_ID,


            requestBody:{

                name:title

            }


        });



    return copy.data.id;


};





// =====================================================
// SYNC PRODUCTION REPORT
// =====================================================

exports.syncProductionReport = async(date)=>{


    try{


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



        if(!sheetInfo){


            spreadsheetId =
                await createSpreadsheet(
                    `Bao cao cat long ${date}`
                );



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
// CREATE GOOGLE SHEET
// =====================================================

exports.createSheet = async(date)=>{


    try{


        const reports =
            await ReportService.getApprovedReportsByDate(date);



        const spreadsheetId =
            await createSpreadsheet(
                `Bao cao cat long ${date}`
            );



        const url =
            `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;



        await GoogleSheetModel.create({

            report_date:date,

            spreadsheet_id:spreadsheetId,

            spreadsheet_url:url

        });



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


            url


        };


    }
    catch(err){


        console.error(
            "CREATE SHEET ERROR"
        );


        console.error(err);


        throw err;


    }


};





// =====================================================
// UPDATE GOOGLE SHEET
// =====================================================

exports.updateSheet = async(date)=>{


    try{


        const sheetInfo =
            await GoogleSheetModel.findByDate(date);



        if(!sheetInfo){


            throw new Error(
                "Chưa có Google Sheet ngày này"
            );


        }



        const reports =
            await ReportService.getApprovedReportsByDate(date);



        const client =
            await auth.getClient();



        const sheets =
            google.sheets({

                version:"v4",

                auth:client

            });



        await writeSheetData(

            sheets,

            sheetInfo.spreadsheet_id,

            reports

        );



        return {


            spreadsheetId:
            sheetInfo.spreadsheet_id,


            url:
            sheetInfo.spreadsheet_url


        };


    }
    catch(err){


        console.error(
            "UPDATE SHEET ERROR"
        );


        console.error(err);


        throw err;


    }


};





// =====================================================
// WRITE DATA
// =====================================================

const writeSheetData = async(
    sheets,
    spreadsheetId,
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

            item.note || ""


        ]);


    });




    await sheets.spreadsheets.values.clear({


        spreadsheetId,


        range:
        "Cắt lồng!A1:Z1000"


    });





    await sheets.spreadsheets.values.update({


        spreadsheetId,


        range:
        "Cắt lồng!A1",


        valueInputOption:
        "RAW",


        requestBody:{

            values

        }


    });


};