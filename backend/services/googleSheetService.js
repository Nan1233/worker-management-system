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
// CONFIG
// =====================================================


const spreadsheetId =
process.env.GOOGLE_SPREADSHEET_ID;



const SHEET_NAME =
"Cắt lồng";







// =====================================================
// SYNC PRODUCTION REPORT
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




        // =============================================
        // FIX WORKER CODE
        // =============================================


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







        // =============================================
        // SORT WORKER
        // =============================================


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







// =====================================================
// CREATE / UPDATE
// =====================================================


exports.createSheet = async(date)=>{


    return await exports.syncProductionReport(date);


};



exports.updateSheet = async(date)=>{


    return await exports.syncProductionReport(date);


};







// =====================================================
// READ OLD DATA
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






    const oldData =

    await getSheetData(sheets);

// =============================================
// GET SHEET INFO
// =============================================

const meta =
await sheets.spreadsheets.get({

    spreadsheetId

});



const sheet =
meta.data.sheets.find(

    s =>
    s.properties.title === SHEET_NAME

);



if(!sheet){

    throw new Error(
        `Không tìm thấy sheet: ${SHEET_NAME}`
    );

}


// =============================================
// CHECK GOOGLE SHEET ROW LIMIT
// =============================================

const currentRows =
sheet.properties.gridProperties.rowCount;



const needRows =
oldData.length + reports.length;



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
                        needRows - currentRows


                    }


                }


            ]


        }


    });


    console.log(
        "ADD ROW:",
        needRows - currentRows
    );


}
    console.log(
        "OLD ROW:",
        oldData.length
    );








    // =============================================
    // MAP ROW CŨ
    // =============================================


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






        // AE là ngày
        // index 30

        const date =

        row[30]
        ?.toString()
        .trim();





        if(worker){


            rowMap[

                `${worker}_${machine}_${date}`

            ] = index + 1;



        }



    });







    let lastRow =

    oldData.length;
    // =============================================
    // LOOP DATA
    // =============================================

    for (const item of reports) {


        const worker =
        String(item.worker_code || "")
        .trim();



        const machine =
        String(item.machine_no || "")
        .trim();



        const workDate =
new Date(item.work_date);



        const key =
        `${worker}_${machine}_${workDate}`;



        let rowNumber =
        rowMap[key];



        if(!rowNumber){

            lastRow++;

            rowNumber =
            lastRow;

        }




        // =============================================
        // NUMBER DATA
        // =============================================


        const ok =
        Number(item.tt_ok || 0);



        const ng =
        Number(item.tt_ng || 0);



        // AB - Định mức lấy từ database
        const standardOutput =
        Number(
            String(item.standard_output || 0)
            .replace(/,/g,"")
        );



        // H - thời gian thực tế
        const actualTime =
        Number(
            item.actual_time || 0
        );



        console.log(
            "CALCULATE:",
            {
                worker,
                machine,
                ok,
                ng,
                standardOutput,
                actualTime
            }
        );




        const rowData = [

            // A STT
            rowNumber - 1,


            // B Worker Code
            worker,


            // C Name
            item.full_name || "",


            // D Machine
            machine,


            // E Shift
            item.shift || "",


            // F %
            1,


            // G Total Time
            Number(item.total_time || 0),


            // H Actual Time
            actualTime,



            // I
            "",


            // J
            Number(item.deduction_time || 0),



            // K-Z
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



            // AA Product
            item.product_name || "",




            // =============================
            // AB = ĐỊNH MỨC
            // =============================

            standardOutput,




            // =============================
            // AC = AG + AH
            // =============================

            `=AG${rowNumber}+AH${rowNumber}`,




            // =============================
            // AD = HIỆU SUẤT
            // AC / AB
            // =============================

            `=AC${rowNumber}/AB${rowNumber}`,




            // =============================
            // AE = NGÀY
            // =============================

            workDate,




            // =============================
            // AF = SẢN LƯỢNG / GIỜ
            // AC / H
            // =============================

            `=AC${rowNumber}/H${rowNumber}`,




            // =============================
            // AG = OK
            // =============================

            ok,




            // =============================
            // AH = NG
            // =============================

            ng,




            // AI
            "",



            // AJ
            "",




            // AK-AZ
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



            // AZ STATUS
            "approved"


        ];        // =============================================
        // COLUMN END
        // =============================================

        const endColumn =
        columnLetter(rowData.length);





        // =============================================
        // WRITE GOOGLE SHEET
        // =============================================


        await sheets.spreadsheets.values.update({


            spreadsheetId,


            range:

            `${SHEET_NAME}!A${rowNumber}:${endColumn}${rowNumber}`,


            // USER_ENTERED để Google Sheet tính công thức

            valueInputOption:"USER_ENTERED",


            requestBody:{


                values:[

                    rowData

                ]


            }


        });





        // =============================================
        // FORMAT NUMBER AB AH + FORMULA COLUMNS
        // =============================================


        const numberColumns = [
    27, // AB
    28, // AC
    29, // AD
    31, // AF
    32, // AG
    33  // AH
];


for(const col of numberColumns){


    await sheets.spreadsheets.batchUpdate({

        spreadsheetId,

        requestBody:{

            requests:[

                {

                    repeatCell:{

                        range:{

                            sheetId:
                            sheet.properties.sheetId,


                            startRowIndex:
                            rowNumber - 1,


                            endRowIndex:
                            rowNumber,


                            startColumnIndex:
                            col,


                            endColumnIndex:
                            col + 1

                        },


                        cell:{

                            userEnteredFormat:{

                                numberFormat:{

                                    type:"NUMBER",

                                    pattern:"0.00"

                                }

                            }

                        },


                        fields:
                        "userEnteredFormat.numberFormat"


                    }

                }

            ]

        }

    });


}



    } // END FOR LOOP






    console.log(
        "GOOGLE SHEET UPDATE SUCCESS"
    );



}; // END writeSheetData







// =====================================================
// COLUMN NUMBER -> LETTER
// =====================================================


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