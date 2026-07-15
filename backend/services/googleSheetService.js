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
// WRITE
// =====================================================


const writeSheetData = async(

    sheets,

    reports

)=>{


    if(!reports || reports.length===0){


        throw new Error(
            "Không có dữ liệu"
        );

    }




    const oldData =
    await getSheetData(sheets);



    console.log(
        "CURRENT ROW:",
        oldData.length
    );





    // ==============================
    // MAP WORKER CODE
    // ==============================


    const employeeMap = {};



    oldData.forEach((row,index)=>{


        if(index===0)
            return;



        const code =
        row[1]?.trim();



        if(code){


            employeeMap[code] =
            index + 1;


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







    // ==============================
    // GHI DỮ LIỆU
    // ==============================


    for(const item of reports){



        const workerCode =
        item.worker_code.trim();



        let rowNumber =
        employeeMap[workerCode];





        if(!rowNumber){


            rowNumber =
            oldData.length + 1;


            maxSTT++;


        }




        console.log(
            "WRITE",
            workerCode,
            "ROW",
            rowNumber
        );





        await sheets.spreadsheets.values.update({


            spreadsheetId,


            range:
            `${SHEET_NAME}!A${rowNumber}:E${rowNumber}`,



            valueInputOption:"RAW",



            requestBody:{


                values:[

                    [

                        oldData[rowNumber-1]?.[0]
                        ||
                        maxSTT,


                        workerCode,


                        item.full_name || "",


                        item.machine_no || "",


                        item.shift || ""

                    ]

                ]

            }


        });



    }





    console.log(
        "GOOGLE SHEET UPDATE SUCCESS"
    );


};