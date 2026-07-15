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
        `${SHEET_NAME}!A:AX`

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






    // FIX GRID LIMIT

    let lastRow =
    oldData.length || 1;



    while(

        oldData[lastRow-1] &&

        oldData[lastRow-1].every(
            v=>v===""

        )

    ){

        lastRow--;

    }






    const meta =
    await sheets.spreadsheets.get({

        spreadsheetId

    });



    const sheet =
    meta.data.sheets.find(

        s=>s.properties.title===SHEET_NAME

    );



    const currentRows =
    sheet.properties.gridProperties.rowCount;





    const needRows =
    lastRow + reports.length;




    if(needRows > currentRows){


        await sheets.spreadsheets.batchUpdate({


            spreadsheetId,


            requestBody:{


                requests:[

                    {

                        appendDimension:{

                            sheetId:
                            sheet.properties.sheetId,


                            dimension:"ROWS",


                            length:
                            needRows-currentRows


                        }

                    }

                ]

            }


        });


    }



    // phần 2 mình gửi tiếp ngay sau đây
        for(const item of reports){



        const worker =
        item.worker_code
        ?.toString()
        .trim();



        const machine =
        item.machine_no
        ?.toString()
        .trim();




        const d = new Date(item.work_date);



        const workDate =
        `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;





        const key =
        `${worker}_${machine}_${workDate}`;





        let rowNumber =
        rowMap[key];





        if(!rowNumber){


            lastRow++;

            rowNumber =
            lastRow;


        }






        // ================================
        // DATA GOOGLE SHEET
        // MATCH FILE MẪU
        // ================================


        const rowData=[


            // A STT
            rowNumber-1,


            // B Mã NV
            safeValue(worker),



            // C Tên
            safeValue(item.full_name),



            // D Số máy
            safeValue(item.machine_no),



            // E Ca
            safeValue(item.shift),




            // F % học việc
            "100%",




            // G TG làm việc
            formatNumber(item.total_time),




            // H TG thực tế
            formatNumber(item.actual_time),




            // I Số lần CM
            "",




            // J Tổng TG trừ giờ
            formatNumber(item.deduction_time),




            // K - Z
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
            "",
            "",





            // AA Sản phẩm
            safeValue(item.product_name),




            // AB Định mức
            formatNumber(item.standard_output),




            // AC TT
            formatNumber(item.actual_output),




            // AD Ngày
            "'" + workDate,




            // AE OK
            formatNumber(item.tt_ok),




            // AF NG
            formatNumber(item.tt_ng),




            // AG
            "",



            // AH KQD
            "",




            // AI - AW lỗi
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
            "",




            // AX trạng thái
            "approved"


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
// SAFE VALUE
// ================================


function safeValue(value){


    if(
        value === null ||
        value === undefined
    ){

        return "";

    }


    return String(value);


}







// ================================
// FORMAT NUMBER
// ================================


function formatNumber(value){


    if(
        value === null ||
        value === undefined ||
        value === ""
    ){

        return 0;

    }



    return Number(value);


}







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