const { google } = require("googleapis");
const ReportService = require("./reportService");



// =====================================================
// GOOGLE AUTH
// =====================================================

const getGoogleAuth = () => {

    const rawCredentials =
        process.env.GOOGLE_SERVICE_ACCOUNT;


    if (!rawCredentials) {

        throw new Error(
            "Thiếu biến môi trường GOOGLE_SERVICE_ACCOUNT"
        );

    }


    let credentials;


    try {

        credentials =
            JSON.parse(rawCredentials);

    }
    catch {

        throw new Error(
            "GOOGLE_SERVICE_ACCOUNT không phải JSON hợp lệ"
        );

    }


    return new google.auth.GoogleAuth({

        credentials,

        scopes: [
            "https://www.googleapis.com/auth/spreadsheets"
        ]

    });

};





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







        if (!spreadsheetId) {

            throw new Error(
                "Thiếu biến môi trường GOOGLE_SPREADSHEET_ID"
            );

        }


        const auth =
        getGoogleAuth();


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


// =====================================================
// WRITE DATA - BATCH VERSION
// Không gọi API trong vòng lặp
// =====================================================

const writeSheetData = async (
    sheets,
    reports,
    type = "pending"
) => {

    if (
        !Array.isArray(reports)
        || reports.length === 0
    ) {

        throw new Error(
            "Không có dữ liệu"
        );

    }


    // =============================================
    // READ OLD DATA
    // =============================================

    const oldData =
        await getSheetData(sheets);


    console.log(
        "OLD ROW:",
        oldData.length
    );


    // =============================================
    // GET SHEET INFO
    // =============================================

    const meta =
        await sheets.spreadsheets.get({

            spreadsheetId

        });


    const sheet =
        meta.data.sheets.find(

            item =>
                item.properties.title
                === SHEET_NAME

        );


    if (!sheet) {

        throw new Error(
            `Không tìm thấy sheet: ${SHEET_NAME}`
        );

    }


    const sheetId =
        sheet.properties.sheetId;


    // =============================================
    // MAP OLD ROW
    // =============================================

    const rowMap = {};


    oldData.forEach((row, index) => {

        if (index === 0) {
            return;
        }


        const worker =
            String(row[1] || "")
                .trim();


        const machine =
            String(row[3] || "")
                .trim();


        const oldDate =
            normalizeDateKey(
                row[30]
            );


        if (worker) {

            rowMap[
                `${worker}_${machine}_${oldDate}`
            ] = index + 1;

        }

    });


    let lastRow =
        Math.max(
            oldData.length,
            1
        );


    // =============================================
    // PREPARE BATCH DATA
    // =============================================

    const batchValues = [];

    const rowNumbers = [];


    for (const item of reports) {

        const worker =
            String(
                item.worker_code || ""
            ).trim();


        const machine =
            String(
                item.machine_no || ""
            ).trim();


        const workDate =
            normalizeDateValue(
                item.work_date
            );


        const workDateKey =
            normalizeDateKey(
                workDate
            );


        const key =
            `${worker}_${machine}_${workDateKey}`;


        let rowNumber =
            rowMap[key];


        if (!rowNumber) {

            lastRow += 1;

            rowNumber =
                lastRow;

            rowMap[key] =
                rowNumber;

        }


        const ok =
            Number(
                item.tt_ok || 0
            );


        const ng =
            Number(
                item.tt_ng || 0
            );


        const standardOutput =
            Number(

                String(
                    item.standard_output || 0
                ).replace(/,/g, "")

            );


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
                actualTime,
                rowNumber
            }
        );


        const rowData = [

            // A - STT
            rowNumber - 1,

            // B - Worker Code
            worker,

            // C - Full Name
            item.full_name || "",

            // D - Machine
            machine,

            // E - Shift
            item.shift || "",

            // F
            1,

            // G - Total Time
            Number(
                item.total_time || 0
            ),

            // H - Actual Time
            actualTime,

            // I
            "",

            // J - Deduction Time
            Number(
                item.deduction_time || 0
            ),

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

            // AA - Product
            item.product_name || "",

            // AB - Standard Output
            standardOutput,

            // AC - OK + NG
            `=AG${rowNumber}+AH${rowNumber}`,

            // AD - Performance
            `=IFERROR(AC${rowNumber}/AB${rowNumber};0)`,

            // AE - Work Date
            workDate,

            // AF - Output Per Hour
            `=IFERROR(AC${rowNumber}/H${rowNumber};0)`,

            // AG - OK
            ok,

            // AH - NG
            ng,

            // AI
            `=IFERROR(AH${rowNumber}/AC${rowNumber};0)`,

            // AJ
            "",

            // AK-AY
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

            // AZ - Status
            type

        ];


        batchValues.push({

            range:
                `${SHEET_NAME}!A${rowNumber}:AZ${rowNumber}`,

            majorDimension:
                "ROWS",

            values: [
                rowData
            ]

        });


        rowNumbers.push(
            rowNumber
        );

    }


    // =============================================
    // EXPAND ROW COUNT IF REQUIRED
    // =============================================

    const currentRows =
        Number(
            sheet.properties
                .gridProperties
                .rowCount || 0
        );


    if (lastRow > currentRows) {

        await sheets.spreadsheets.batchUpdate({

            spreadsheetId,

            requestBody: {

                requests: [

                    {
                        appendDimension: {

                            sheetId,

                            dimension:
                                "ROWS",

                            length:
                                lastRow
                                - currentRows

                        }
                    }

                ]

            }

        });


        console.log(
            "ADD ROW:",
            lastRow - currentRows
        );

    }


    // =============================================
    // WRITE ALL ROWS IN ONE REQUEST
    // =============================================

    await sheets.spreadsheets.values.batchUpdate({

        spreadsheetId,

        requestBody: {

            valueInputOption:
                "USER_ENTERED",

            data:
                batchValues

        }

    });


    // =============================================
    // BUILD FORMAT REQUESTS
    // =============================================

    const formatRequests = [];


    for (const rowNumber of rowNumbers) {

        const startRowIndex =
            rowNumber - 1;


        // AE - Date
        formatRequests.push({

            repeatCell: {

                range: {

                    sheetId,

                    startRowIndex,

                    endRowIndex:
                        rowNumber,

                    startColumnIndex:
                        30,

                    endColumnIndex:
                        31

                },

                cell: {

                    userEnteredFormat: {

                        numberFormat: {

                            type:
                                "DATE",

                            pattern:
                                "dd/mm/yyyy"

                        }

                    }

                },

                fields:
                    "userEnteredFormat.numberFormat"

            }

        });


        // AB, AC
        formatRequests.push({

            repeatCell: {

                range: {

                    sheetId,

                    startRowIndex,

                    endRowIndex:
                        rowNumber,

                    startColumnIndex:
                        27,

                    endColumnIndex:
                        29

                },

                cell: {

                    userEnteredFormat: {

                        numberFormat: {

                            type:
                                "NUMBER",

                            pattern:
                                "0.00"

                        }

                    }

                },

                fields:
                    "userEnteredFormat.numberFormat"

            }

        });


        // AD - Percentage
        formatRequests.push({

            repeatCell: {

                range: {

                    sheetId,

                    startRowIndex,

                    endRowIndex:
                        rowNumber,

                    startColumnIndex:
                        29,

                    endColumnIndex:
                        30

                },

                cell: {

                    userEnteredFormat: {

                        numberFormat: {

                            type:
                                "PERCENT",

                            pattern:
                                "0.00%"

                        }

                    }

                },

                fields:
                    "userEnteredFormat.numberFormat"

            }

        });


        // AF, AG, AH
        formatRequests.push({

            repeatCell: {

                range: {

                    sheetId,

                    startRowIndex,

                    endRowIndex:
                        rowNumber,

                    startColumnIndex:
                        31,

                    endColumnIndex:
                        34

                },

                cell: {

                    userEnteredFormat: {

                        numberFormat: {

                            type:
                                "NUMBER",

                            pattern:
                                "0.00"

                        }

                    }

                },

                fields:
                    "userEnteredFormat.numberFormat"

            }

        });

    }


    // =============================================
    // FORMAT ALL ROWS IN ONE REQUEST
    // =============================================

    if (formatRequests.length > 0) {

        await sheets.spreadsheets.batchUpdate({

            spreadsheetId,

            requestBody: {

                requests:
                    formatRequests

            }

        });

    }


    console.log(
        "GOOGLE SHEET UPDATE SUCCESS:",
        {
            total:
                reports.length,

            writeRequests:
                2,

            rows:
                rowNumbers
        }
    );

};




// =====================================================
// NORMALIZE DATE VALUE
// =====================================================

function normalizeDateValue(value) {

    if (!value) {

        return "";

    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return String(value);

    }


    return date;

}


// =====================================================
// NORMALIZE DATE KEY
// yyyy-mm-dd
// =====================================================

function normalizeDateKey(value) {

    if (!value) {

        return "";

    }


    // Google Sheet trả về dd/mm/yyyy
    const text =
        String(value).trim();


    const viDate =
        text.match(
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
        );


    if (viDate) {

        const day =
            viDate[1]
                .padStart(2, "0");

        const month =
            viDate[2]
                .padStart(2, "0");

        const year =
            viDate[3];


        return `${year}-${month}-${day}`;

    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return text;

    }


    return date
        .toISOString()
        .slice(0, 10);

}
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