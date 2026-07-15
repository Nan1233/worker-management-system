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
            "REPORT COUNT:",
            reports.length
        );



        // chỉ lấy báo cáo có mã NV

        const cleanReports =
        reports.filter(item=>item.worker_code);



        cleanReports.sort((a,b)=>{


            return String(a.worker_code)
            .localeCompare(
                String(b.worker_code),
                undefined,
                {
                    numeric:true
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
            "SYNC GOOGLE SHEET ERROR",
            err
        );


        throw err;


    }


};






exports.createSheet = async(date)=>{

    return exports.syncProductionReport(date);

};



exports.updateSheet = async(date)=>{

    return exports.syncProductionReport(date);

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


    if(!reports.length){

        throw new Error(
            "Không có dữ liệu"
        );

    }





    const oldData =
    await getSheetData(sheets);




    console.log(
        "OLD ROW:",
        oldData.length
    );






    // =====================
    // MAP DÒNG CŨ
    // =====================


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



        // AE = ngày
        const date =
        row[30]
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

        item.work_date

        ?

        new Date(item.work_date)
        .toLocaleDateString("vi-VN")

        :

        "";





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
        // TÍNH SẢN LƯỢNG
        // ============================


        const ok =
        Number(item.tt_ok || 0);



        const ng =
        Number(item.tt_ng || 0);



        // AC = AG + AH

        const totalOutput =
        ok + ng;





        // AF = AC / H

        const productivity =

        Number(item.actual_time) > 0

        ?

        totalOutput /
        Number(item.actual_time)

        :

        "";









        // ============================
        // DATA GOOGLE SHEET
        // ============================


        const rowData=[



            rowNumber-1,                 // A STT



            worker || "",                // B Mã NV



            item.full_name ?? "",        // C Tên



            item.machine_no ?? "",       // D Số máy



            item.shift ?? "",            // E Ca



            item.training_percent ?? 
            "100%",                      // F % học việc



            item.total_time ?? "",       // G Thời gian làm việc



            item.actual_time ?? "",      // H Thời gian thực tế



            item.cm_count ?? "",         // I Số lần CM



            item.deduction_time ?? "",   // J Tổng TG trừ giờ



            item.thieu_san_luong ?? "",  // K Thiếu sản lượng



            item.bat_may ?? "",          // L Bật máy



            item.chuyen_ma ?? "",        // M Chuyển mã



            item.chinh_may ?? "",        // N Chỉnh máy



            item.cho_chinh_may ?? "",    // O Chờ chỉnh máy



            item.mat_dien ?? "",         // P Mất điện



            item.mat_khi ?? "",          // Q Mất khí



            item.cho_hang ?? "",         // R Chờ hàng



            item.bao_duong ?? "",        // S Bảo dưỡng



            item.nghi_giai_lao ?? "",    // T Nghỉ giải lao



            item.giao_ca ?? "",          // U Giao ca



            item.ho_tro ?? "",           // V Hỗ trợ



            item.giat_cs ?? "",          // W Giặt cs



            item.five_s ?? "",           // X 5S



            item.hoc_viec ?? "",         // Y Học việc



            item.di_muon ?? "",          // Z Đi muộn





            item.product_name ?? "",     // AA SP



            item.standard_output ?? "",  // AB Định mức



            totalOutput || "",           // AC = AG + AH



            "",                          // AD trống



            workDate,                    // AE Ngày



            productivity || "",          // AF = AC / H



            ok || "",                    // AG OK



            ng || "",                    // AH NG






            // =====================
            // CHI TIẾT LỖI
            // =====================


            item.vo_do_long ?? "",       // AI Vỡ cao su


            item.xuoc_do_long ?? "",     // AJ Xước cong gãy


            item.xoay ?? "",             // AK Cao su xoay


            item.khong_dut ?? "",        // AL Cắt không đứt


            item.bavia_hut ?? "",        // AM Bavia


            item.loi_cao_su ?? "",       // AN CSH


            item.ppcm ?? "",             // AO PPCM


            item.ng_kich_thuoc ?? "",    // AP KT lớn


            item.kt_nho ?? "",           // AQ KT nhỏ


            item.lcs ?? "",              // AR LCS


            item.cat_lem ?? "",          // AS Cắt lẹm


            item.rach_nvl ?? "",         // AT Rách NVL


            item.chan_ngan_dai ?? "",    // AU Chân ngắn dài


            item.sot_via ?? "",          // AV Sót via


            item.fure_truc ?? "",        // AW Fure trục



            "approved"                   // AX trạng thái


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


        const rem =
        (num-1)%26;



        str =
        String.fromCharCode(
            65 + rem
        )
        +
        str;



        num =
        Math.floor(
            (num-1)/26
        );


    }



    return str;


}