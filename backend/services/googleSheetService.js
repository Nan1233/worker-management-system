const { google } = require("googleapis");
const ReportService = require("./reportService");


// ================================
// GOOGLE AUTH
// ================================

const credentials = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT
);


const auth = new google.auth.GoogleAuth({

    credentials,

    scopes:[
        "https://www.googleapis.com/auth/spreadsheets"
    ]

});



// ================================
// CONFIG
// ================================

const spreadsheetId =
process.env.GOOGLE_SPREADSHEET_ID;


const SHEET_NAME = "Cắt lồng";




// ================================
// SYNC
// ================================

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





// ================================
// READ SHEET
// ================================


const getSheetData = async(sheets)=>{


    const result =

    await sheets.spreadsheets.values.get({

        spreadsheetId,

        range:
        `${SHEET_NAME}!A:AZ`

    });


    return result.data.values || [];

};






// ================================
// WRITE SHEET
// ================================


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





    /*
        Tạo map:
        worker_code + process_name + date

        Ví dụ:

        W001_Gia công_2026-07-14

        => tìm đúng dòng
    */


    const rowMap = {};



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
        row[25]
        ?.toString()
        .trim();



        if(worker){


            rowMap[
                `${worker}_${process}_${date}`
            ]
            =
            index + 1;


        }


    });






    let maxRow =
    oldData.length;



    // ============================
    // LOOP REPORT
    // ============================


    for(const item of reports){



        const worker =
        item.worker_code
        ?.toString()
        .trim();



        const process =
        item.process_name
        ?.toString()
        .trim();




        const workDate =
        new Date(item.work_date)
        .toLocaleDateString("vi-VN");





        const key =
        `${worker}_${process}_${workDate}`;





        let rowNumber =
        rowMap[key];






        // chưa có dòng

        if(!rowNumber){


            maxRow++;


            rowNumber=maxRow;


            console.log(
                "ADD ROW:",
                rowNumber
            );


        }
        else{


            console.log(
                "UPDATE ROW:",
                rowNumber
            );


        }





        const rowData=[


            rowNumber-1,              // STT


            worker,                   // Mã NV


            process,                  // Công đoạn


            item.machine_no || "",    // Máy


            item.shift || "",         // Ca


            "",                       // % học việc


            item.total_time || "",


            item.actual_time || "",


            item.deduction_time || "",


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



            item.standard_output || 0,



            item.actual_output || 0,



            workDate,



            item.tt_ok || 0,



            item.tt_ng || 0,



            item.note || ""



        ];







        await sheets.spreadsheets.values.update({


            spreadsheetId,


            range:
            `${SHEET_NAME}!A${rowNumber}:AC${rowNumber}`,



            valueInputOption:"RAW",



            requestBody:{


                values:[

                    rowData

                ]


            }


        });




    }




    console.log(
        "GOOGLE SHEET UPDATE SUCCESS"
    );


};