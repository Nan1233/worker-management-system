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
        await ReportService.getApprovedReportsByDate(date);



        console.log(
            "========== GOOGLE SHEET =========="
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
            "GOOGLE SHEET ERROR",
            err
        );


        throw err;


    }


};




// =====================================================
// CREATE
// =====================================================

exports.createSheet = async(date)=>{


    return await exports.syncProductionReport(date);


};




// =====================================================
// UPDATE
// =====================================================

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
            "Không có dữ liệu approved"
        );

    }



    const oldData =
    await getSheetData(sheets);



    console.log(
        "CURRENT ROW:",
        oldData.length
    );





    // =====================================
    // MAP MÃ NHÂN VIÊN CỘT B
    // =====================================


    const employeeMap = {};



    oldData.forEach((row,index)=>{


        if(index===0)
            return;



        const code =
        row[1];


        if(code){

            employeeMap[code]
            =
            index + 1;

        }


    });







    // =====================================
    // XỬ LÝ TỪNG REPORT
    // =====================================


    for(const item of reports){



        const code =
        item.worker_code;



        const existRow =
        employeeMap[code];





        // =====================================
        // CÓ MÃ -> UPDATE
        // =====================================

        if(existRow){


            console.log(
                "UPDATE",
                code,
                "ROW",
                existRow
            );



            await updateRow(

                sheets,

                existRow,

                item

            );


        }






        // =====================================
        // KHÔNG CÓ -> TÌM DÒNG TRỐNG CỘT B
        // =====================================

        else{


            let emptyRow = null;



            oldData.forEach((row,index)=>{


                if(index===0)
                    return;



                const stt =
                row[0];


                const worker =
                row[1];



                if(

                    stt &&
                    (!worker || worker==="") &&
                    !emptyRow

                ){

                    emptyRow =
                    index + 1;

                }


            });





            if(emptyRow){



                console.log(
                    "INSERT EMPTY ROW",
                    code,
                    emptyRow
                );



                await updateRow(

                    sheets,

                    emptyRow,

                    item

                );



            }
            else{



                console.log(
                    "APPEND",
                    code
                );



                await appendRow(

                    sheets,

                    oldData.length + 1,

                    item

                );


            }



        }



    }



    console.log(
        "GOOGLE SHEET UPDATE SUCCESS"
    );


};









// =====================================================
// UPDATE TỪNG Ô
// KHÔNG PHÁ CÔNG THỨC
// =====================================================

const updateRow = async(

    sheets,

    row,

    item

)=>{


    await sheets.spreadsheets.values.batchUpdate({


        spreadsheetId,


        requestBody:{


            valueInputOption:"RAW",



            data:[



                {
                    range:`${SHEET_NAME}!A${row}`,

                    values:[
                        [
                            row-1
                        ]
                    ]

                },


                {
                    range:`${SHEET_NAME}!B${row}`,

                    values:[
                        [
                            item.worker_code || ""
                        ]
                    ]

                },


                {
                    range:`${SHEET_NAME}!D${row}`,

                    values:[
                        [
                            item.machine_no || ""
                        ]
                    ]

                },


                {
                    range:`${SHEET_NAME}!E${row}`,

                    values:[
                        [
                            item.shift || ""
                        ]
                    ]

                },


                {
                    range:`${SHEET_NAME}!V${row}`,

                    values:[
                        [
                            item.product_name || ""
                        ]
                    ]

                },


                {
                    range:`${SHEET_NAME}!W${row}`,

                    values:[
                        [
                            item.standard_output || ""
                        ]
                    ]

                },


                {
                    range:`${SHEET_NAME}!X${row}`,

                    values:[
                        [
                            item.actual_output || ""
                        ]
                    ]

                },


                {
                    range:`${SHEET_NAME}!Y${row}`,

                    values:[
                        [
                            item.work_date || ""
                        ]
                    ]

                },


                {
                    range:`${SHEET_NAME}!Z${row}`,

                    values:[
                        [
                            item.tt_ok || ""
                        ]
                    ]

                },


                {
                    range:`${SHEET_NAME}!AA${row}`,

                    values:[
                        [
                            item.tt_ng || ""
                        ]
                    ]

                }

            ]

        }

    });


};








// =====================================================
// APPEND
// =====================================================

const appendRow = async(

    sheets,

    row,

    item

)=>{


    await updateRow(

        sheets,

        row,

        item

    );


};