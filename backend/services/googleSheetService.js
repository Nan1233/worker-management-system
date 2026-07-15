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
// GOOGLE SHEET
// =====================================================

const spreadsheetId =
process.env.GOOGLE_SPREADSHEET_ID;



const SHEET_NAME = "Cắt lồng";





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
            "GOOGLE SHEET ERROR"
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
// LẤY DỮ LIỆU SHEET HIỆN TẠI
// =====================================================

const getSheetData = async(sheets)=>{


    const result =

    await sheets.spreadsheets.values.get({


        spreadsheetId,


        range:

        `${SHEET_NAME}!A:AZ`


    });



    return result.data.values || [];


};









// =====================================================
// GHI DATA
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






    // đọc dữ liệu hiện tại

    const oldData =
    await getSheetData(sheets);





    console.log(
        "CURRENT ROW:",
        oldData.length
    );







    // map mã nhân viên cột B


    const employeeMap = {};



    oldData.forEach((row,index)=>{


        if(index===0)
            return;



        const workerCode =
        row[1];



        if(workerCode){


            employeeMap[workerCode]
            =
            index + 1;


        }


    });








    for(const item of reports){



        const row = [



            "",                       // STT

            item.worker_code || "",   // CỘT B

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



            // ==================================
            // CÓ MÃ -> GHI ĐÈ DÒNG CŨ
            // ==================================


            console.log(

                "UPDATE",

                item.worker_code,

                "ROW",

                existRow

            );




            await sheets.spreadsheets.values.update({



                spreadsheetId,



                range:

                `${SHEET_NAME}!A${existRow}`,



                valueInputOption:"RAW",



                requestBody:{


                    values:[row]


                }



            });




        }

        else{



            // ==================================
            // KHÔNG CÓ MÃ -> THÊM CUỐI
            // ==================================


            console.log(

                "APPEND",

                item.worker_code

            );




            // ==================================
// KHÔNG CÓ MÃ -> TÌM DÒNG TRỐNG CỘT B
// ==================================

let emptyRow = null;


oldData.forEach((oldRow,index)=>{


    if(index===0)
        return;


    const stt = oldRow[0];

    const workerCode = oldRow[1];


    if(
        stt &&
        (!workerCode || workerCode==="")
        &&
        !emptyRow
    ){

        emptyRow = index + 1;

    }


});





if(emptyRow){


    console.log(
        "INSERT INTO EMPTY ROW:",
        emptyRow
    );



    row[0] = emptyRow - 1;



    await sheets.spreadsheets.values.update({


        spreadsheetId,


        range:
        `${SHEET_NAME}!A${emptyRow}`,



        valueInputOption:"RAW",


        requestBody:{


            values:[
                row
            ]


        }


    });



}
else{


    // không còn dòng trống -> thêm cuối


    const newSTT =
    oldData.length;



    row[0] = newSTT;



    await sheets.spreadsheets.values.append({


        spreadsheetId,


        range:
        `${SHEET_NAME}!A:AZ`,



        valueInputOption:"RAW",


        insertDataOption:"INSERT_ROWS",


        requestBody:{


            values:[
                row
            ]


        }


    });



}





        }



    }






    console.log(

        "GOOGLE SHEET UPDATE SUCCESS"

    );


};