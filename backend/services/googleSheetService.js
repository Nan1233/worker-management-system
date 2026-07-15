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


const SHEET_NAME = "Cắt lồng";




// =====================================================
// SYNC
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


    if(!reports || reports.length===0){

        throw new Error(
            "Không có dữ liệu approved"
        );

    }



    const oldData =
    await getSheetData(sheets);



    console.log(
        "CURRENT ROW:",
        oldData.length
    );





    // ================================
    // MAP MÃ NHÂN VIÊN CỘT B
    // ================================


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






    for(const item of reports){



        const workerCode =
        item.worker_code?.trim();



        let rowNumber =
        employeeMap[workerCode];





        // ================================
        // TÌM DÒNG TRỐNG CỘT B
        // ================================

        if(!rowNumber){


            for(let i=1;i<oldData.length;i++){


                const stt =
                oldData[i][0];


                const code =
                oldData[i][1];



                if(
                    stt &&
                    (!code || code==="")
                ){

                    rowNumber =
                    i+1;

                    break;

                }


            }


        }





        // ================================
        // THÊM CUỐI
        // ================================

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



        console.log(
            "VALUE",
            [
                workerCode,
                item.full_name,
                item.machine_no,
                item.shift
            ]
        );






        // ================================
        // CHỈ GHI Ô DỮ LIỆU
        // GIỮ CÔNG THỨC
        // ================================


        await sheets.spreadsheets.values.update({


            spreadsheetId,


            range:
            `${SHEET_NAME}!A${rowNumber}:E${rowNumber}`,



            valueInputOption:"RAW",



            requestBody:{


                values:[

                    [

                        rowNumber===oldData.length+1
                        ? maxSTT
                        : oldData[rowNumber-1]?.[0] || "",


                        workerCode || "",


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