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

const writeSheetData = async(

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




    // =================================================
    // LẤY BẢN GHI MỚI NHẤT THEO MÃ NV
    // =================================================


    const latestMap = {};



    reports.forEach(item=>{


        const code =
        item.worker_code
        ?.toString()
        .trim();



        if(!code)
            return;




        if(

            !latestMap[code]

            ||

            new Date(item.created_at)

            >

            new Date(
                latestMap[code].created_at
            )

        ){


            latestMap[code]=item;


        }


    });




    const finalReports =
    Object.values(latestMap);




    console.log(
        "AFTER FILTER:",
        finalReports
    );









    const oldData =
    await getSheetData(sheets);




    console.log(
        "CURRENT ROW:",
        oldData.length
    );









    // =================================================
    // MAP MÃ NHÂN VIÊN CỘT B
    // =================================================


    const employeeMap = {};




    oldData.forEach((row,index)=>{


        if(index===0)
            return;



        const code =
        row[1]
        ?.toString()
        .trim();




        if(code){


            employeeMap[code]=index+1;


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



        const code =
        item.worker_code
        .toString()
        .trim();




        let rowNumber =
        employeeMap[code];







        // =============================================
        // CHƯA CÓ MÃ
        // TÌM DÒNG CUỐI CÓ MÃ THẬT
        // =============================================


        if(!rowNumber){



            let lastRow = 1;




            for(
                let i = oldData.length - 1;
                i >= 1;
                i--
            ){



                const oldCode =
                oldData[i][1]
                ?.toString()
                .trim();




                if(oldCode){


                    lastRow = i + 1;


                    break;


                }


            }






            rowNumber =
            lastRow + 1;




            maxSTT++;



        }







        console.log(

            "WRITE",

            code,

            "ROW",

            rowNumber

        );









        // =============================================
        // GHI STT + MÃ NV
        // =============================================


        await sheets.spreadsheets.values.update({



            spreadsheetId,



            range:

            `${SHEET_NAME}!A${rowNumber}:B${rowNumber}`,



            valueInputOption:"RAW",



            requestBody:{



                values:[

                    [

                        oldData[rowNumber-1]?.[0]
                        ||
                        maxSTT,


                        code

                    ]

                ]



            }



        });










        // =============================================
        // GHI MÁY + CA
        // D,E
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



    }






    console.log(

        "GOOGLE SHEET UPDATE SUCCESS"

    );



};