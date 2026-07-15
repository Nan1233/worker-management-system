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
// CONTROLLER COMPATIBLE
// =====================================================

exports.createSheet = async(date)=>{

    return exports.syncProductionReport(date);

};



exports.updateSheet = async(date)=>{

    return exports.syncProductionReport(date);

};






// =====================================================
// READ SHEET
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
// FIND NEXT STT
// =====================================================

const getNextSTT = (data)=>{


    let max = 0;


    data.forEach((row,index)=>{


        if(index===0)
            return;


        const stt =
        Number(row[0]);



        if(stt > max){

            max = stt;

        }


    });



    return max + 1;


};








// =====================================================
// WRITE DATA
// =====================================================

const writeSheetData = async(

    sheets,

    reports

)=>{


    if(!reports.length){

        throw new Error(
            "Không có dữ liệu approved"
        );

    }



    let oldData =
    await getSheetData(sheets);



    console.log(
        "CURRENT ROW:",
        oldData.length
    );





    // map mã nhân viên

    const employeeMap = {};



    oldData.forEach((row,index)=>{


        if(index===0)
            return;


        const code =
        row[1];


        if(code){

            employeeMap[code] =
            index + 1;

        }


    });





    let nextSTT =
    getNextSTT(oldData);





    for(const item of reports){



        let rowIndex =
        employeeMap[item.worker_code];




        // ======================================
        // nếu chưa có mã
        // tìm dòng có STT nhưng B trống
        // ======================================

        if(!rowIndex){


            oldData.forEach((row,index)=>{


                if(index===0)
                    return;



                if(

                    row[0]

                    &&

                    (!row[1] || row[1]==="")

                    &&

                    !rowIndex

                ){

                    rowIndex =
                    index + 1;

                }


            });


        }






        // ======================================
        // nếu vẫn không có -> thêm cuối
        // ======================================

        if(!rowIndex){


            rowIndex =
            oldData.length + 1;


            nextSTT++;


        }






        console.log(

            "WRITE",

            item.worker_code,

            "ROW",

            rowIndex

        );







        // ======================================
        // GHI TỪNG VÙNG
        // KHÔNG PHÁ CÔNG THỨC
        // ======================================



        await sheets.spreadsheets.values.update({


            spreadsheetId,


            range:
            `${SHEET_NAME}!A${rowIndex}:E${rowIndex}`,



            valueInputOption:"RAW",


            requestBody:{


                values:[[


                    row[0] || nextSTT,


                    item.worker_code || "",


                    item.full_name || "",


                    item.machine_no || "",


                    item.shift || ""


                ]]


            }


        });








        await sheets.spreadsheets.values.update({


            spreadsheetId,


            range:
            `${SHEET_NAME}!Z${rowIndex}:AB${rowIndex}`,



            valueInputOption:"RAW",


            requestBody:{


                values:[[


                    item.product_name || "",


                    item.standard_output || "",


                    item.actual_output || ""


                ]]


            }


        });








        await sheets.spreadsheets.values.update({


            spreadsheetId,


            range:
            `${SHEET_NAME}!AD${rowIndex}:AG${rowIndex}`,



            valueInputOption:"RAW",


            requestBody:{


                values:[[


                    item.work_date || "",


                    "",


                    item.tt_ok || "",


                    item.tt_ng || ""


                ]]


            }


        });





        // cập nhật map sau khi ghi

        employeeMap[item.worker_code] =
        rowIndex;



    }





    console.log(
        "GOOGLE SHEET UPDATE SUCCESS"
    );


};