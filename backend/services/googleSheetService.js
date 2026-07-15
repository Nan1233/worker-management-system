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


        let reports =
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



        // ================================
        // LẤY BẢN GHI MỚI NHẤT THEO MÃ NV
        // ================================


        const latest = {};



        reports.forEach(item=>{


            const code =
            item.worker_code;



            if(
                !latest[code] ||
                new Date(item.created_at)
                >
                new Date(latest[code].created_at)
            ){

                latest[code]=item;

            }


        });



        reports =
        Object.values(latest);



        console.log(
            "AFTER FILTER:",
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


    if(!reports.length){


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





    // =================================
    // MAP MÃ NHÂN VIÊN
    // =================================


    const employeeMap = {};



    oldData.forEach((row,index)=>{


        if(index===0)
            return;



        const code =
        row[1]?.trim();



        if(code){


            employeeMap[code]=index+1;


        }



    });







    // =================================
    // LẤY SHEET INFO
    // =================================


    const spreadsheet =

    await sheets.spreadsheets.get({

        spreadsheetId

    });



    const sheetId =

    spreadsheet.data.sheets.find(

        s=>s.properties.title===SHEET_NAME

    )
    .properties.sheetId;



    const maxRows =

    spreadsheet.data.sheets.find(

        s=>s.properties.title===SHEET_NAME

    )
    .properties.gridProperties.rowCount;






    let maxSTT=0;



    oldData.forEach(row=>{


        const stt =
        Number(row[0]);


        if(stt>maxSTT)

            maxSTT=stt;


    });







    for(const item of reports){



        const code =
        item.worker_code.trim();



        let rowNumber =
        employeeMap[code];






        // =================================
        // TÌM DÒNG TRỐNG CỘT B
        // =================================


        if(!rowNumber){


            for(let i=1;i<oldData.length;i++){


                if(
                    !oldData[i][1] ||
                    oldData[i][1]===""
                ){


                    rowNumber=i+1;

                    break;

                }


            }


        }





        // =================================
        // THÊM DÒNG MỚI
        // =================================


        if(!rowNumber){


            rowNumber =
            oldData.length+1;



            if(rowNumber>maxRows){



                await sheets.spreadsheets.batchUpdate({

                    spreadsheetId,


                    requestBody:{


                        requests:[

                            {

                                appendDimension:{


                                    sheetId,


                                    dimension:"ROWS",


                                    length:100


                                }


                            }


                        ]


                    }


                });


            }


            maxSTT++;


        }






        console.log(

            "WRITE",

            code,

            "ROW",

            rowNumber

        );







        // =================================
        // CHỈ GHI B-E
        // GIỮ CÔNG THỨC
        // =================================


        await sheets.spreadsheets.values.update({


            spreadsheetId,


            range:

            `${SHEET_NAME}!B${rowNumber}:E${rowNumber}`,



            valueInputOption:"RAW",



            requestBody:{


                values:[

                    [

                        code || "",


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