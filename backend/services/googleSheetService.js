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


        let reports =
        await ReportService.getReportsByDate(date);



        console.log(
            "========== GOOGLE SHEET =========="
        );


        console.log(
            "REPORT COUNT:",
            reports.length
        );



        // ============================
        // FIX DATA
        // FILL MÃ NV TRỐNG
        // ============================

        let lastWorker = null;


        const cleanReports = [];


        reports.forEach(item=>{


            if(item.worker_code){

                lastWorker =
                item.worker_code;

            }


            if(lastWorker){


                item.worker_code =
                lastWorker;


                cleanReports.push(item);


            }


        });



        // ============================
        // SORT THEO MÃ NV
        // ============================

        cleanReports.sort((a,b)=>{


            return String(a.worker_code)
            .localeCompare(
                String(b.worker_code),
                undefined,
                {
                    numeric:true,
                    sensitivity:"base"
                }
            );


        });




        const client =
        await auth.getClient();



        const sheets =
        google.sheets({

            version:"v4",

            auth:client

        });



        await writeSheetData(

            sheets,

            cleanReports

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







    // MAP DÒNG CŨ

    const rowMap = {};



    oldData.forEach((row,index)=>{


        if(index===0)
            return;



        const worker =
        row[1]
        ?.toString()
        .trim();



        const machine =
        row[3]
        ?.toString()
        .trim();



        const date =
        row[29]
        ?.toString()
        .trim();



        if(worker){


            rowMap[
                `${worker}_${machine}_${date}`
            ]
            =
            index+1;


        }


    });






    let lastRow =
    oldData.length;






    for(const item of reports){



        const worker =
        item.worker_code
        ?.toString()
        .trim();



        const machine =
        item.machine_no
        ?.toString()
        .trim();



        const workDate =
        new Date(item.work_date)
        .toLocaleDateString("vi-VN");





        const key =
        `${worker}_${machine}_${workDate}`;





        let rowNumber =
        rowMap[key];





        if(!rowNumber){


            lastRow++;

            rowNumber =
            lastRow;


        }







        // ============================
        // DATA GOOGLE SHEET
        // THEO FILE MẪU
        // ============================


        const rowData=[


            rowNumber-1,              // A STT


            worker || "",             // B Mã NV


            item.full_name || "",     // C Tên


            item.machine_no || "",    // D Số máy


            item.shift || "",         // E Ca


            "100%",                   // F % học việc


            item.total_time || "",    // G TG làm việc


            item.actual_time || "",   // H TG thực tế


            "",                       // I Số lần CM


            item.deduction_time || "",// J Tổng TG trừ giờ


            "",                       // K Thiếu sản lượng


            "",                       // L Bật máy


            "",                       // M Chuyển mã


            "",                       // N Chỉnh máy


            "",                       // O Chờ chỉnh máy


            "",                       // P Mất điện


            "",                       // Q Mất khí


            "",                       // R Chờ hàng


            "",                       // S Bảo dưỡng


            "",                       // T Nghỉ giải lao


            "",                       // U Giao ca


            "",                       // V Hỗ trợ


            "",                       // W Giặt cs


            "",                       // X 5S


            "",                       // Y Học việc


            "",                       // Z Đi muộn


            item.product_name || "",  // AA SP


            item.standard_output || 0,// AB Định mức


            item.actual_output || 0,  // AC TT


            workDate,                 // AD Ngày


            item.tt_ok || 0,           // AE OK


            item.tt_ng || 0,           // AF NG


            "",                       // AG


            "",                       // AH KQD


            "",                       // AI Vỡ cao su


            "",                       // AJ Xước cong gãy


            "",                       // AK Cao su xoay


            "",                       // AL Cắt không đứt


            "",                       // AM bavia


            "",                       // AN CSH


            "",                       // AO PPCM


            "",                       // AP KT lớn


            "",                       // AQ KT nhỏ


            "",                       // AR LCS


            "",                       // AS Cắt lẹm


            "",                       // AT Rách NVL


            "",                       // AU Chân ngắn dài


            "",                       // AV Sót via


            "",                       // AW Fure trục


            "approved"                // AX Trạng thái


        ];







        const endColumn =
        columnLetter(rowData.length);





        await sheets.spreadsheets.values.update({


            spreadsheetId,


            range:
            `${SHEET_NAME}!A${rowNumber}:${endColumn}${rowNumber}`,



            valueInputOption:"RAW",



            requestBody:{


                values:[rowData]


            }


        });


    }






    console.log(
        "GOOGLE SHEET UPDATE SUCCESS"
    );


};









// ================================
// COLUMN NUMBER -> LETTER
// ================================

function columnLetter(num){


    let str="";


    while(num>0){


        let rem =
        (num-1)%26;


        str =
        String.fromCharCode(65+rem)
        +
        str;



        num =
        Math.floor(
            (num-1)/26
        );


    }


    return str;


}