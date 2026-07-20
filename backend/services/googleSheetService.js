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
const DATA_START_ROW = 327;






// =====================================================
// SYNC PRODUCTION REPORT
// =====================================================

exports.syncProductionReport = async (
    date
) => {
    try {
        if (!spreadsheetId) {
            throw new Error(
                "Thiếu biến môi trường GOOGLE_SPREADSHEET_ID"
            );
        }

        /*
         * Không chỉ lấy ngày vừa duyệt.
         *
         * Cần lấy toàn bộ báo cáo đã duyệt để có thể:
         * - chèn ngày cũ vào giữa;
         * - sắp lại các ngày;
         * - đánh lại STT;
         * - sắp lại ID công nhân.
         */
        const reports =
            await ReportService
                .getAllApprovedReportsForSheet();

        console.log(
            "========== GOOGLE SHEET =========="
        );

        console.log(
            "SYNC DATE:",
            date
        );

        console.log(
            "REPORT COUNT:",
            reports.length
        );

        reports.sort(
            compareReportsForSheet
        );

        const auth =
            getGoogleAuth();

        const client =
            await auth.getClient();

        const sheets =
            google.sheets({
                version: "v4",
                auth: client
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
    catch (error) {
        console.error(
            "SYNC GOOGLE SHEET ERROR:",
            error
        );

        throw error;
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
        `${SHEET_NAME}!A:BA`

    });



    return result.data.values || [];

};







// =====================================================
// WRITE DATA
// =====================================================

const normalizeText = value => {
    return String(value || "")
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase()
        .replace(
            /[^a-z0-9]+/g,
            " "
        )
        .trim();
};

const toNumber = value => {
    const result =
        Number(
            String(value ?? 0)
                .replace(/,/g, "")
                .trim()
        );

    return Number.isFinite(result)
        ? result
        : 0;
};
const getDeductionHours = (
    report,
    aliases
) => {
    const normalizedAliases =
        aliases.map(normalizeText);

    return (
        report.deductions || []
    )
        .filter(item => {
            const code =
                normalizeText(
                    item.deduction_code
                );

            const name =
                normalizeText(
                    item.deduction_name
                );

            return normalizedAliases.some(
                alias =>
                    alias === code ||
                    alias === name ||
                    name.includes(alias)
            );
        })
        .reduce(
            (total, item) =>
                total +
                toNumber(item.hours),
            0
        );
};
const getDefectQuantity = (
    report,
    aliases
) => {
    const normalizedAliases =
        aliases.map(normalizeText);

    return (
        report.defects || []
    )
        .filter(item => {
            const code =
                normalizeText(
                    item.defect_code
                );

            const name =
                normalizeText(
                    item.defect_name
                );

            return normalizedAliases.some(
                alias =>
                    alias === code ||
                    alias === name ||
                    name.includes(alias)
            );
        })
        .reduce(
            (total, item) =>
                total +
                toNumber(item.quantity),
            0
        );
};
const formatDisplayDate = value => {
    const dateKey =
        normalizeDateKey(value);

    if (!dateKey) {
        return "";
    }

    const [
        year,
        month,
        day
    ] = dateKey.split("-");

    return `${day}/${month}/${year}`;
};
const buildReportRow = (
    report,
    sequenceNumber,
    rowNumber
) => {
    const rowData =
        Array(53).fill("");

    const ok =
        toNumber(report.tt_ok);

    const ng =
        toNumber(report.tt_ng);

    // A - STT
    rowData[0] =
        sequenceNumber;

    // B - Mã công nhân
    rowData[1] =
        report.worker_code || "";

    // C - Họ tên
    rowData[2] =
        report.full_name || "";

    // D - Máy
    rowData[3] =
        report.machine_no || "";

    // E - Ca
    rowData[4] =
        report.shift || "";

    // F - Phần trăm học việc
    rowData[5] =
        toNumber(
            report.training_percent || 100
        ) / 100;

    // G - Tổng thời gian
    rowData[6] =
        toNumber(report.total_time);

    // H - Thời gian thực tế
    rowData[7] =
        toNumber(report.actual_time);

    // I - Trống
    rowData[8] = "";

    // J - Tổng thời gian trừ
    rowData[9] =
        toNumber(report.deduction_time);

    // K - Thiếu sản lượng
    rowData[10] =
        getDeductionHours(
            report,
            [
                "THIEU_SP",
                "Thiếu sản lượng"
            ]
        );

    // L - Bật máy, xét máy
    rowData[11] =
        getDeductionHours(
            report,
            [
                "BAT_MAY",
                "Bật máy, xét máy"
            ]
        );

    // M - Chuyển mã
    rowData[12] =
        getDeductionHours(
            report,
            [
                "CHUYEN_MA",
                "Chuyển mã"
            ]
        );

    // N - Chỉnh máy
    rowData[13] =
        getDeductionHours(
            report,
            [
                "CHINH_MAY",
                "Chỉnh máy"
            ]
        );

    // O - Chờ chỉnh máy
    rowData[14] =
        getDeductionHours(
            report,
            [
                "CHO_CHINH_MAY",
                "Chờ chỉnh máy"
            ]
        );

    // P - Mất điện
    rowData[15] =
        getDeductionHours(
            report,
            [
                "MAT_DIEN",
                "Mất điện"
            ]
        );

    // Q - Mất khí
    rowData[16] =
        getDeductionHours(
            report,
            [
                "MAT_KHI",
                "Mất khí"
            ]
        );

    // R - Chờ hàng
    rowData[17] =
        getDeductionHours(
            report,
            [
                "CHO_HANG",
                "Chờ hàng"
            ]
        );

    // S - Bảo dưỡng máy
    rowData[18] =
        getDeductionHours(
            report,
            [
                "BAO_DUONG",
                "Bảo dưỡng máy"
            ]
        );

    // T - Nghỉ giải lao
    rowData[19] =
        getDeductionHours(
            report,
            [
                "NGHI_GIAI_LAO",
                "Nghỉ giải lao"
            ]
        );

    // U - Giao ca
    rowData[20] =
        getDeductionHours(
            report,
            [
                "GIAO_CA",
                "Giao ca"
            ]
        );

    // V - Dừng máy hỗ trợ
    rowData[21] =
        getDeductionHours(
            report,
            [
                "HO_TRO",
                "Dừng máy đi hỗ trợ"
            ]
        );

    // W - Giặt/cân/tuốt/tái/GL
    rowData[22] =
        getDeductionHours(
            report,
            [
                "GIAT_CAN",
                "Giặt cs/cân cs, tuốt-tái pp, GL"
            ]
        );

    // X - 5S
    rowData[23] =
        getDeductionHours(
            report,
            ["5S"]
        );

    // Y - Học việc, đào tạo
    rowData[24] =
        getDeductionHours(
            report,
            [
                "HOC_VIEC",
                "Học việc, đào tạo"
            ]
        );

    // Z - Trống
    rowData[25] = "";

    // AA - Sản phẩm
    rowData[26] =
        report.product_name || "";

    // AB - Sản lượng chuẩn
    rowData[27] =
        toNumber(report.standard_output);

    // AC - Tổng sản lượng
    rowData[28] =
        `=AG${rowNumber}+AH${rowNumber}`;

    // AD - Hiệu suất
    rowData[29] =
        `=IFERROR(AC${rowNumber}/AB${rowNumber};0)`;

    // AE - Ngày làm việc
    rowData[30] =
        normalizeDateValue(
            report.work_date
        );

    // AF - Sản lượng/giờ
    rowData[31] =
        `=IFERROR(AC${rowNumber}/H${rowNumber};0)`;

    // AG - OK
    rowData[32] = ok;

    // AH - NG
    rowData[33] = ng;

    // AI - Tỷ lệ NG
    rowData[34] =
        `=IFERROR(AH${rowNumber}/AC${rowNumber};0)`;

    // AJ - Trống
    rowData[35] = "";

    // AK - KQĐ dập lại
    rowData[36] =
        getDefectQuantity(
            report,
            [
                "KQD_DAP_LAI",
                "KQĐ dập lại",
                "Dập lại"
            ]
        );

    // AL - KQĐ tuột
    rowData[37] =
        getDefectQuantity(
            report,
            [
                "KQD_TUOT",
                "KQĐ tuột",
                "Tuột"
            ]
        );

    // AM - Vỡ do lồng
    rowData[38] =
        getDefectQuantity(
            report,
            [
                "VO_DO_LONG",
                "Vỡ do lồng"
            ]
        );

    // AN - Xước do lồng
    rowData[39] =
        getDefectQuantity(
            report,
            [
                "XUOC_DO_LONG",
                "Xước do lồng"
            ]
        );

    // AO - Cong gãy
    rowData[40] =
        getDefectQuantity(
            report,
            [
                "CONG_GAY",
                "Cong gãy"
            ]
        );

    // AP - Xoay
    rowData[41] =
        getDefectQuantity(
            report,
            ["XOAY", "Xoay"]
        );

    // AQ - Không đứt
    rowData[42] =
        getDefectQuantity(
            report,
            [
                "KHONG_DUT",
                "Không đứt"
            ]
        );

    // AR - Bavia hụt
    rowData[43] =
        getDefectQuantity(
            report,
            [
                "BAVIA_HUT",
                "Bavia hụt"
            ]
        );

    // AS - PPCM
    rowData[44] =
        getDefectQuantity(
            report,
            ["PPCM"]
        );

    // AT - Lỗi cao su
    rowData[45] =
        getDefectQuantity(
            report,
            [
                "LOI_CAO_SU",
                "Lỗi cao su"
            ]
        );

    // AU - NG kích thước
rowData[46] =
    getDefectQuantity(
        report,
        [
            "NG_KICH_THUOC",
            "NG kích thước"
        ]
    );

// AV - Cắt lẹm
rowData[47] =
    getDefectQuantity(
        report,
        [
            "CAT_LEM",
            "Cắt lẹm"
        ]
    );

// AW - Chặn ngắn dài
rowData[48] =
    getDefectQuantity(
        report,
        [
            "CHAN_NGAN_DAI",
            "CHAN_NGAN",
            "Chặn ngắn dài",
            "Chặn ngắn",
            "Chan ngan dai"
        ]
    );

// AX - Sót via
rowData[49] =
    getDefectQuantity(
        report,
        [
            "SOT_VIA",
            "SOT_BAVIA",
            "Sót via",
            "Sót bavia",
            "Sot via"
        ]
    );

// AY - Fure trục
rowData[50] =
    getDefectQuantity(
        report,
        [
            "FURE_TRUC",
            "FURE",
            "Fure trục",
            "Fure truc"
        ]
    );

// AZ - Trạng thái
rowData[51] =
    report.status || "approved";

// BA - Ghi chú
rowData[52] =
    report.note || "";

return rowData;

    return rowData;
};
const buildAllSheetRows = reports => {
    const rows = [];

    let currentDate = "";
    let sequenceNumber = 0;

    reports.forEach(report => {
        const dateKey =
            normalizeDateKey(
                report.work_date
            );

        if (dateKey !== currentDate) {
            currentDate =
                dateKey;

            sequenceNumber = 0;

            const dateRow =
                Array(53
                ).fill("");

            // Dòng cách ngày chỉ ghi cột A
            dateRow[0] =
    formatDisplayDate(report.work_date);

            rows.push(dateRow);
        }

        sequenceNumber += 1;

        /*
         * DATA_START_ROW + rows.length:
         *
         * rows.length đã bao gồm dòng ngày,
         * vì vậy công thức sẽ tham chiếu đúng
         * dòng thực tế trên Google Sheet.
         */
        const rowNumber =
            DATA_START_ROW +
            rows.length;

        rows.push(
            buildReportRow(
                report,
                sequenceNumber,
                rowNumber
            )
        );
    });

    return rows;
};
const compareReportsForSheet = (
    first,
    second
) => {
    const firstDate =
        normalizeDateKey(
            first.work_date
        );

    const secondDate =
        normalizeDateKey(
            second.work_date
        );

    const dateCompare =
        firstDate.localeCompare(
            secondDate
        );

    if (dateCompare !== 0) {
        return dateCompare;
    }

    const workerCompare =
        String(first.worker_code || "")
            .localeCompare(
                String(second.worker_code || ""),
                undefined,
                {
                    numeric: true,
                    sensitivity: "base"
                }
            );

    if (workerCompare !== 0) {
        return workerCompare;
    }

    return (
        Number(first.id) -
        Number(second.id)
    );
};
const writeSheetData = async (
    sheets,
    reports
) => {
    const meta =
        await sheets.spreadsheets.get({
            spreadsheetId
        });

    const targetSheet =
        meta.data.sheets.find(
            item =>
                item.properties.title ===
                SHEET_NAME
        );

    if (!targetSheet) {
        throw new Error(
            `Không tìm thấy sheet: ${SHEET_NAME}`
        );
    }

    const sheetId =
        targetSheet.properties.sheetId;

    reports.sort(
        compareReportsForSheet
    );

    const rows =
        buildAllSheetRows(reports);

    const oldData =
        await getSheetData(sheets);

    const oldLastRow =
        Math.max(
            oldData.length,
            DATA_START_ROW
        );

    const newLastRow =
        rows.length > 0
            ? DATA_START_ROW +
              rows.length -
              1
            : DATA_START_ROW;

    const requiredLastRow =
        Math.max(
            oldLastRow,
            newLastRow
        );

    const currentGridRows =
        Number(
            targetSheet.properties
                .gridProperties
                .rowCount || 0
        );

    if (
        requiredLastRow >
        currentGridRows
    ) {
        await sheets.spreadsheets
            .batchUpdate({
                spreadsheetId,

                requestBody: {
                    requests: [
                        {
                            appendDimension: {
                                sheetId,
                                dimension:
                                    "ROWS",
                                length:
                                    requiredLastRow -
                                    currentGridRows
                            }
                        }
                    ]
                }
            });
    }

    await sheets.spreadsheets
        .values.clear({
            spreadsheetId,

            range:
                `${SHEET_NAME}!A${DATA_START_ROW}:BA${requiredLastRow}`
        });

    if (rows.length === 0) {
        console.log(
            "GOOGLE SHEET CLEARED: NO REPORTS"
        );

        return;
    }

    await sheets.spreadsheets
        .values.update({
            spreadsheetId,

            range:
                `${SHEET_NAME}!A${DATA_START_ROW}:BA${newLastRow}`,

            valueInputOption: "RAW",

            requestBody: {
                majorDimension:
                    "ROWS",

                values:
                    rows
            }
        });

    const formatRequests = [];

    rows.forEach(
        (rowData, index) => {
            const rowNumber =
                DATA_START_ROW +
                index;

            const startRowIndex =
                rowNumber - 1;

            const isDateRow =
                Boolean(rowData[0]) &&
                !rowData[1];

            if (isDateRow) {
                // Dòng phân cách ngày: cột A phải là text để giữ dd/mm/yyyy.
                // values.clear() không xóa định dạng cũ nên cần ép lại format.
                formatRequests.push({
                    repeatCell: {
                        range: {
                            sheetId,
                            startRowIndex,
                            endRowIndex:
                                startRowIndex + 1,
                            startColumnIndex: 0,
                            endColumnIndex: 1
                        },

                        cell: {
                            userEnteredFormat: {
                                numberFormat: {
                                    type: "DATE",
pattern: "dd/MM/yyyy"
                                },
                                textFormat: {
                                    bold: true
                                }
                            }
                        },

                        fields:
                            "userEnteredFormat.numberFormat,userEnteredFormat.textFormat.bold"
                    }
                });

                return;
            }

            // Dòng báo cáo: cột A luôn là STT dạng số nguyên.
            // Nếu ô từng được định dạng DATE, các số 1,2,3,4 sẽ bị hiển thị
            // thành 01/01/1900, 02/01/1900... nên phải reset từng dòng.
            formatRequests.push({
                repeatCell: {
                    range: {
                        sheetId,
                        startRowIndex,
                        endRowIndex:
                            startRowIndex + 1,
                        startColumnIndex: 0,
                        endColumnIndex: 1
                    },

                    cell: {
                        userEnteredFormat: {
                            numberFormat: {
                                type: "NUMBER",
                                pattern: "0"
                            },
                            textFormat: {
                                bold: false
                            }
                        }
                    },

                    fields:
                        "userEnteredFormat.numberFormat,userEnteredFormat.textFormat.bold"
                }
            });

            formatRequests.push({
                repeatCell: {
                    range: {
                        sheetId,
                        startRowIndex,
                        endRowIndex:
                            startRowIndex + 1,
                        startColumnIndex: 5,
                        endColumnIndex: 6
                    },

                    cell: {
                        userEnteredFormat: {
                            numberFormat: {
                                type: "PERCENT",
                                pattern: "0.00%"
                            }
                        }
                    },

                    fields:
                        "userEnteredFormat.numberFormat"
                }
            });

            formatRequests.push({
                repeatCell: {
                    range: {
                        sheetId,
                        startRowIndex,
                        endRowIndex:
                            startRowIndex + 1,
                        startColumnIndex: 29,
                        endColumnIndex: 30
                    },

                    cell: {
                        userEnteredFormat: {
                            numberFormat: {
                                type: "PERCENT",
                                pattern: "0.00%"
                            }
                        }
                    },

                    fields:
                        "userEnteredFormat.numberFormat"
                }
            });

            formatRequests.push({
                repeatCell: {
                    range: {
                        sheetId,
                        startRowIndex,
                        endRowIndex:
                            startRowIndex + 1,
                        startColumnIndex: 30,
                        endColumnIndex: 31
                    },

                    cell: {
                        userEnteredFormat: {
                            numberFormat: {
                                type: "DATE",
                                pattern: "dd/mm/yyyy"
                            }
                        }
                    },

                    fields:
                        "userEnteredFormat.numberFormat"
                }
            });

            formatRequests.push({
                repeatCell: {
                    range: {
                        sheetId,
                        startRowIndex,
                        endRowIndex:
                            startRowIndex + 1,
                        startColumnIndex: 34,
                        endColumnIndex: 35
                    },

                    cell: {
                        userEnteredFormat: {
                            numberFormat: {
                                type: "PERCENT",
                                pattern: "0.00%"
                            }
                        }
                    },

                    fields:
                        "userEnteredFormat.numberFormat"
                }
            });
        }
    );

    if (formatRequests.length > 0) {
        await sheets.spreadsheets
            .batchUpdate({
                spreadsheetId,

                requestBody: {
                    requests:
                        formatRequests
                }
            });
    }

    console.log(
        "GOOGLE SHEET REBUILD SUCCESS:",
        {
            reportCount:
                reports.length,

            totalRows:
                rows.length,

            firstRow:
                DATA_START_ROW,

            lastRow:
                newLastRow
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

    const date = new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return String(value);
    }

    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    );

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