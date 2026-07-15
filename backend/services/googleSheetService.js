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
// CONFIG
// =====================================================

const spreadsheetId =
process.env.GOOGLE_SPREADSHEET_ID;


const SHEET_NAME = "Cắt lồng";





// =====================================================
// SYNC
// =====================================================

exports.syncProductionReport = async(date)=>{


    try{


        const reports =
        await ReportService.getReportsByDate(date);



        console.log(
            "========== GOOGLE SHEET =========="
        );


        console.log(
            "REPORT COUNT:",
            reports.length
        );


        console.log(
            "REPORT DATA:",
            reports
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






exports.createSheet = async(date)=>{


    return await exports.syncProductionReport(date);


};





exports.updateSheet = async(date)=>{


    return await exports.syncProductionReport(date);


};









// =====================================================
// READ SHEET
// =====================================================

const getSheetData = async(sheets)=>{


    const result =

    await sheets.spreadsheets.values.get({


        spreadsheetId,


        range:
        `${SHEET_NAME}!A:ZZ`


    });



    return result.data.values || [];


};









// =====================================================
// WRITE DATA
// =====================================================

// =====================================================
// WRITE DATA
// =====================================================

const writeSheetData = async (

    sheets,

    reports

)=>{


    if(
        !reports ||
        reports.length===0
    ){

        throw new Error(
            "Không có dữ liệu"
        );

    }




    console.log(
        "REPORT BEFORE WRITE:",
        reports.length
    );



    // KHÔNG FILTER THEO WORKER_CODE
    // MỖI BÁO CÁO = 1 DÒNG


    const finalReports = reports;



    console.log(
        "FINAL REPORT:",
        finalReports
    );






    const oldData =
    await getSheetData(sheets);



    console.log(
        "CURRENT ROW:",
        oldData.length
    );





    // =================================================
    // MAP KEY ĐỂ KHÔNG GHI ĐÈ
    // worker + process + date
    // =================================================


    const employeeMap = {};



    oldData.forEach((row,index)=>{


        if(index===0)
            return;



        const worker =
        row[1]
        ?.toString()
        .trim();


        const process =
        row[2]
        ?.toString()
        .trim();



        const date =
        row[29]
        ?.toString()
        .trim();



        if(worker){


            const key =
            `${worker}_${process}_${date}`;



            employeeMap[key]=index+1;


        }


    });







    let maxSTT = 0;



    oldData.forEach(row=>{


        const stt =
        Number(row[0]);



        if(stt > maxSTT){

            maxSTT = stt;

        }


    });








    // =================================================
    // WRITE
    // =================================================


    for(const item of finalReports){



        const workerCode =
        item.worker_code
        ?.toString()
        .trim();



        const processName =
        item.process_name
        ?.toString()
        .trim();



        const workDate =
        new Date(item.work_date)
        .toLocaleDateString("vi-VN");




        const key =
        `${workerCode}_${processName}_${workDate}`;





        let rowNumber =
        employeeMap[key];







        // CHƯA CÓ -> THÊM DÒNG MỚI

        if(!rowNumber){


            rowNumber =
            oldData.length + 1;



            maxSTT++;


        }







        console.log(

            "WRITE",

            workerCode,

            processName,

            "ROW",

            rowNumber

        );









        // =============================================
        // A B C
        // STT - Worker - Process
        // =============================================


        await sheets.spreadsheets.values.update({


            spreadsheetId,


            range:

            `${SHEET_NAME}!A${rowNumber}:C${rowNumber}`,



            valueInputOption:"RAW",


            requestBody:{


                values:[

                    [

                        oldData[rowNumber-1]?.[0]
                        ||
                        maxSTT,


                        workerCode,


                        processName


                    ]

                ]


            }


        });









        // =============================================
        // D E
        // Máy + Ca
        // =============================================


        await sheets.spreadsheets.values.update({


            spreadsheetId,


            range:

            `${SHEET_NAME}!D${rowNumber}:E${rowNumber}`,



            valueInputOption:"RAW",



            requestBody:{


                values:[

                    [

                        item.machine_no || "",


                        item.shift || ""


                    ]

                ]


            }



        });






        // =============================================
        // SP
        // =============================================


        await sheets.spreadsheets.values.update({


            spreadsheetId,


            range:

            `${SHEET_NAME}!Z${rowNumber}:AD${rowNumber}`,



            valueInputOption:"RAW",



            requestBody:{


                values:[

                    [

                        item.product_name || "",


                        item.standard_output || 0,


                        item.actual_output || 0,


                        item.work_date,


                        item.tt_ok || 0


                    ]

                ]


            }



        });



    }





    console.log(

        "GOOGLE SHEET UPDATE SUCCESS"

    );


};