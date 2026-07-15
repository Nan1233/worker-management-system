const { google } = require("googleapis");

const ReportService = require("./reportService");
const GoogleSheetModel = require("../models/googleSheetModel");

// =============================
// GOOGLE AUTH FROM RENDER ENV
// =============================

const credentials = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT
);

const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]
});// =============================
// SYNC GOOGLE SHEET
// =============================
exports.syncProductionReport = async (date) => {

    try {

        const reports = await ReportService.getApprovedReportsByDate(date);

        const client = await auth.getClient();

        const accessToken = await client.getAccessToken();

        console.log("========== GOOGLE AUTH ==========");
        console.log("EMAIL:", credentials.client_email);
        console.log("PROJECT:", credentials.project_id);
        console.log("TOKEN:", accessToken ? "OK" : "NULL");

        const sheets = google.sheets({
            version: "v4",
            auth: client
        });

        let sheetInfo =
            await GoogleSheetModel.findByDate(date);

        let spreadsheetId;

        // =================================
        // CHƯA CÓ SHEET -> TẠO MỚI
        // =================================
        if (!sheetInfo) {

            console.log("Creating new spreadsheet...");

            const create = await sheets.spreadsheets.create({

                requestBody: {

                    properties: {
                        title: `Bao cao cat long ${date}`
                    },

                    sheets: [
                        {
                            properties: {
                                title: "Cắt lồng"
                            }
                        }
                    ]
                }

            });

            spreadsheetId = create.data.spreadsheetId;

            const url =
                `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

            await GoogleSheetModel.create({

                report_date: date,

                spreadsheet_id: spreadsheetId,

                spreadsheet_url: url

            });

        } else {

            spreadsheetId = sheetInfo.spreadsheet_id;

        }

        // =============================
        // DATA
        // =============================

        const values = [[

            "STT",
            "Mã CN",
            "Tên CN",
            "Công đoạn",
            "Ngày",
            "Ca",
            "Máy",
            "Sản phẩm",
            "SL chuẩn",
            "SL thực tế",
            "OK",
            "NG",
            "Trạng thái",
            "Ghi chú"

        ]];

        reports.forEach((item, index) => {

            values.push([

                index + 1,
                item.worker_code,
                item.full_name,
                item.process_name,
                item.work_date,
                item.shift,
                item.machine_no,
                item.product_name,
                item.standard_output,
                item.actual_output,
                item.tt_ok,
                item.tt_ng,
                item.status,
                item.note || ""

            ]);

        });

        // =============================
        // CLEAR
        // =============================

        await sheets.spreadsheets.values.clear({

            spreadsheetId,

            range: "Cắt lồng!A1:Z1000"

        });

        // =============================
        // WRITE
        // =============================

        await sheets.spreadsheets.values.update({

            spreadsheetId,

            range: "Cắt lồng!A1",

            valueInputOption: "RAW",

            requestBody: {
                values
            }

        });

        return {

            spreadsheetId,

            url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`

        };

    }
    catch (err) {

        console.error("========== GOOGLE ERROR ==========");
        console.error(JSON.stringify(err.response?.data?.error, null, 2));
        console.error(err);

        throw err;
    }

};// =====================================================
// CREATE GOOGLE SHEET MỚI
// =====================================================
exports.createSheet = async (date) => {

    try {

        const reports =
            await ReportService.getApprovedReportsByDate(date);

        const client =
            await auth.getClient();

        const accessToken =
            await client.getAccessToken();

        console.log("========== CREATE SHEET ==========");
        console.log("EMAIL:", credentials.client_email);
        console.log("PROJECT:", credentials.project_id);
        console.log("TOKEN:", accessToken ? "OK" : "NULL");

        const sheets =
            google.sheets({

                version: "v4",

                auth: client

            });

        console.log("Creating spreadsheet...");

        const create =
            await sheets.spreadsheets.create({

                requestBody: {

                    properties: {

                        title: `Bao cao cat long ${date}`

                    },

                    sheets: [

                        {

                            properties: {

                                title: "Cắt lồng"

                            }

                        }

                    ]

                }

            });

        console.log("Spreadsheet created:", create.data.spreadsheetId);

        const spreadsheetId =
            create.data.spreadsheetId;

        const url =
            `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

        await GoogleSheetModel.create({

            report_date: date,

            spreadsheet_id: spreadsheetId,

            spreadsheet_url: url

        });

        await writeSheetData(

            sheets,

            spreadsheetId,

            reports

        );

        return {

            spreadsheetId,

            url

        };

    }
    catch (err) {

        console.error("========== CREATE SHEET ERROR ==========");

        if (err.response?.data) {
            console.error(
                JSON.stringify(err.response.data, null, 2)
            );
        }

        console.error(err);

        throw err;

    }

};// =====================================================
// UPDATE GOOGLE SHEET
// =====================================================
exports.updateSheet = async (date) => {

    try {

        const sheetInfo =
            await GoogleSheetModel.findByDate(date);

        if (!sheetInfo) {

            throw new Error(
                "Chưa có Google Sheet ngày này"
            );

        }

        const reports =
            await ReportService.getApprovedReportsByDate(date);

        const client =
            await auth.getClient();

        const accessToken =
            await client.getAccessToken();

        console.log("========== UPDATE SHEET ==========");
        console.log("EMAIL:", credentials.client_email);
        console.log("PROJECT:", credentials.project_id);
        console.log("TOKEN:", accessToken ? "OK" : "NULL");
        console.log("SPREADSHEET:", sheetInfo.spreadsheet_id);

        const sheets =
            google.sheets({

                version: "v4",

                auth: client

            });

        await writeSheetData(

            sheets,

            sheetInfo.spreadsheet_id,

            reports

        );

        return {

            spreadsheetId:
                sheetInfo.spreadsheet_id,

            url:
                sheetInfo.spreadsheet_url

        };

    }
    catch (err) {

        console.error("========== UPDATE SHEET ERROR ==========");

        if (err.response?.data) {

            console.error(
                JSON.stringify(
                    err.response.data,
                    null,
                    2
                )
            );

        }

        console.error(err);

        throw err;

    }

};// =====================================================
// UPDATE GOOGLE SHEET CŨ
// =====================================================

exports.updateSheet = async (date) => {
    const sheetInfo = await GoogleSheetModel.findByDate(date);

    if (!sheetInfo) {
        throw new Error("Chưa có Google Sheet ngày này");
    }

    const reports = await ReportService.getApprovedReportsByDate(date);

    const client = await auth.getClient();

    const sheets = google.sheets({
        version: "v4",
        auth: client
    });

    await writeSheetData(
        sheets,
        sheetInfo.spreadsheet_id,
        reports
    );

    return {
        spreadsheetId: sheetInfo.spreadsheet_id,
        url: sheetInfo.spreadsheet_url
    };
};




// =====================================================
// GHI DATA CHUNG
// =====================================================

const writeSheetData = async (
    sheets,
    spreadsheetId,
    reports
) => {

    const values = [
        [
            "STT",
            "Mã CN",
            "Tên CN",
            "Công đoạn",
            "Ngày",
            "Ca",
            "Máy",
            "Sản phẩm",
            "SL chuẩn",
            "SL thực tế",
            "OK",
            "NG",
            "Trạng thái",
            "Ghi chú"
        ]
    ];

    reports.forEach((item, index) => {
        values.push([
            index + 1,
            item.worker_code,
            item.full_name,
            item.process_name,
            item.work_date,
            item.shift,
            item.machine_no,
            item.product_name,
            item.standard_output,
            item.actual_output,
            item.tt_ok,
            item.tt_ng,
            item.status,
            item.note || ""
        ]);
    });

    await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: "Cắt lồng!A1:Z1000"
    });

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Cắt lồng!A1",
        valueInputOption: "RAW",
        requestBody: {
            values
        }
    });
};