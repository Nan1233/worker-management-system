const { google } = require("googleapis");
const ReportService = require("./reportService");


// ================================
// GOOGLE AUTH
// ================================

const credentials =
JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT
);



const auth =
new google.auth.GoogleAuth({

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


const SHEET_NAME =
"Cắt lồng";





// ================================
// SYNC
// ================================

exports.syncProductionReport =
async(date)=>{


    try{


        const reports =
        await ReportService
        .getReportsByDate(date);



        console.log(
            "REPORT COUNT:",
            reports.length
        );





        const cleanReports =
        reports.filter(
            item =>
            item.worker_code
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
            "SYNC GOOGLE SHEET ERROR",
            err
        );


        throw err;


    }


};





exports.createSheet =
async(date)=>{

    return exports.syncProductionReport(date);

};




exports.updateSheet =
async(date)=>{

    return exports.syncProductionReport(date);

};







// ================================
// READ SHEET
// ================================

const getSheetData =
async(sheets)=>{


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

const writeSheetData =
async(
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




    let lastRow =
    oldData.length;





    for(const item of reports){



        lastRow++;



        const rowNumber =
        lastRow;






        const workDate =

        item.work_date

        ?

        new Date(item.work_date)
        .toLocaleDateString("vi-VN")

        :

        "";






        const ok =
        item.tt_ok ?? "";



        const ng =
        item.tt_ng ?? "";








        const rowData = [



            rowNumber - 1,              // A STT



            item.worker_code || "",     // B Mã NV



            item.full_name || "",       // C Tên



            item.machine_no || "",      // D Số máy



            item.shift || "",           // E Ca



            "100%",                     // F % học việc



            item.total_time || "",      // G Thời gian làm việc



            item.actual_time || "",     // H Thời gian thực tế



            item.cm_count || "",        // I Số lần CM



            item.deduction_time || "",  // J Tổng TG trừ giờ



            item.thieu_san_luong || "", // K Thiếu sản lượng



            item.bat_may || "",         // L Bật máy



            item.chuyen_ma || "",       // M Chuyển mã



            item.chinh_may || "",       // N Chỉnh máy



            item.cho_chinh_may || "",   // O Chờ chỉnh máy



            item.mat_dien || "",        // P Mất điện



            item.mat_khi || "",         // Q Mất khí



            item.cho_hang || "",        // R Chờ hàng



            item.bao_duong || "",       // S Bảo dưỡng



            item.nghi_giai_lao || "",   // T Nghỉ giải lao



            item.giao_ca || "",         // U Giao ca



            item.ho_tro || "",          // V Hỗ trợ



            item.giat_cs || "",         // W Giặt CS



            item.five_s || "",          // X 5S



            item.hoc_viec || "",        // Y Học việc



            item.di_muon || "",         // Z Đi muộn




            item.product_name || "",    // AA Sản phẩm



            item.standard_output || "", // AB Định mức



            // =========================
            // AC = AG / H
            // =========================

            `=IFERROR(AG${rowNumber}/H${rowNumber},"")`,



            "",                         // AD



            workDate,                   // AE Ngày



            // =========================
            // AF = AC / H
            // =========================

            `=IFERROR(AC${rowNumber}/H${rowNumber},"")`,



            // =========================
            // AG = OK
            // =========================

            ok,



            // =========================
            // AH = NG
            // =========================

            ng,
            "",       // AI Vỡ cao su


            "",       // AJ Xước cong gãy


            "",       // AK Cao su xoay


            "",       // AL Cắt không đứt


            "",       // AM Bavia


            "",       // AN CSH


            "",       // AO PPCM


            "",       // AP KT lớn


            "",       // AQ KT nhỏ


            "",       // AR LCS


            "",       // AS Cắt lẹm


            "",       // AT Rách NVL


            "",       // AU Chân ngắn dài


            "",       // AV Sót via


            "",       // AW Fure trục



            "approved" // AX Trạng thái


        ];






        const endColumn =
        columnLetter(
            rowData.length
        );






        await sheets.spreadsheets.values.update({


            spreadsheetId,



            range:

            `${SHEET_NAME}!A${rowNumber}:${endColumn}${rowNumber}`,



            valueInputOption:

            "USER_ENTERED",



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


    let str = "";



    while(num > 0){



        let rem =
        (num - 1) % 26;



        str =
        String.fromCharCode(
            65 + rem
        )
        +
        str;



        num =
        Math.floor(
            (num - 1) / 26
        );



    }



    return str;


}