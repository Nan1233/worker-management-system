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


    const oldData =
    await getSheetData(sheets);



    const employeeMap={};


    oldData.forEach((row,index)=>{


        if(index===0)
            return;


        const code=row[1];


        if(code){

            employeeMap[code]=index+1;

        }


    });




    let lastSTT=0;


    oldData.forEach(row=>{


        if(row[0] && !isNaN(row[0])){

            lastSTT=Math.max(
                lastSTT,
                Number(row[0])
            );

        }


    });




    for(const item of reports){


        const existRow =
        employeeMap[item.worker_code];



        let targetRow;



        if(existRow){


            targetRow=existRow;


        }
        else{


            // tìm dòng có STT nhưng B trống

            targetRow=null;


            for(let i=1;i<oldData.length;i++){


                const stt=oldData[i][0];

                const code=oldData[i][1];


                if(
                    stt &&
                    !code
                ){

                    targetRow=i+1;
                    break;

                }


            }



            if(!targetRow){


                lastSTT++;


                targetRow =
                oldData.length+1;


            }


        }




        const values=[


            item.worker_code || "",       // B


            item.full_name || "",         // C


            item.machine_no || "",        // D


            item.shift || "",             // E


            "",                           // F


            "",                           // G


            "",                           // H


            "",                           // I


            "",                           // J


            "",                           // K


            "",                           // L


            "",                           // M


            "",                           // N


            "",                           // O


            "",                           // P


            "",                           // Q


            "",                           // R


            "",                           // S


            "",                           // T


            "",                           // U


            "",                           // V


            item.product_name || "",      // W


            item.standard_output || "",   // X


            item.actual_output || "",     // Y


            item.work_date || "",         // Z


            item.tt_ok || "",             // AA


            item.tt_ng || "",             // AB


            item.status || ""             // AC


        ];





        if(!existRow){


            await sheets.spreadsheets.values.update({


                spreadsheetId,


                range:
                `${SHEET_NAME}!A${targetRow}:AC${targetRow}`,



                valueInputOption:"RAW",


                requestBody:{


                    values:[

                        [
                            oldData[targetRow-1]?.[0]
                            ||
                            targetRow-1,

                            ...values

                        ]

                    ]

                }


            });


        }
        else{


            await sheets.spreadsheets.values.update({


                spreadsheetId,


                range:
                `${SHEET_NAME}!B${targetRow}:AC${targetRow}`,


                valueInputOption:"RAW",


                requestBody:{


                    values:[values]


                }


            });


        }



    }


};