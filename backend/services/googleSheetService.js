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
// GET SHEET DATA
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


    if(!reports || reports.length===0){

        throw new Error(
            "Không có dữ liệu"
        );

    }



    /*
        Lấy bản ghi mới nhất
        theo worker_code
    */


    const latestMap = {};



    reports.forEach(item=>{


        const code =
        item.worker_code?.trim();



        if(!code)
            return;



        if(
            !latestMap[code]
            ||
            new Date(item.created_at)
            >
            new Date(latestMap[code].created_at)
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





    // ===============================
    // MAP MÃ NHÂN VIÊN CỘT B
    // ===============================


    const employeeMap={};



    oldData.forEach((row,index)=>{


        if(index===0)
            return;



        const code =
        row[1]?.toString().trim();



        if(code){

            employeeMap[code]=index+1;

        }


    });





    let maxSTT=0;


    oldData.forEach(row=>{


        const stt =
        Number(row[0]);


        if(stt>maxSTT){

            maxSTT=stt;

        }

    });






    for(const item of finalReports){



        const code =
        item.worker_code.trim();



        let rowNumber =
        employeeMap[code];





        // ==================================
        // chưa có mã -> tìm dòng trống cột B
        // ==================================


        if(!rowNumber){


            for(let i=1;i<oldData.length;i++){



                if(
                    !oldData[i][1]
                    ||
                    oldData[i][1]===""
                ){


                    rowNumber=i+1;

                    break;

                }

            }


        }






        // ==================================
        // hết dòng -> thêm cuối
        // ==================================

        if(!rowNumber){


            rowNumber =
            oldData.length+1;


            maxSTT++;



            await addRows(
                sheets,
                50
            );


        }




        console.log(
            "WRITE",
            code,
            "ROW",
            rowNumber
        );





        /*
            Không ghi cột C
            vì đang có công thức

            ghi:
            A STT
            B mã
            D máy
            E ca
        */



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









// =====================================================
// ADD ROW
// =====================================================

const addRows = async(

    sheets,

    length

)=>{


    await sheets.spreadsheets.batchUpdate({


        spreadsheetId,


        requestBody:{


            requests:[


                {

                    appendDimension:{


                        sheetId:0,


                        dimension:"ROWS",


                        length


                    }

                }


            ]

        }


    });


};