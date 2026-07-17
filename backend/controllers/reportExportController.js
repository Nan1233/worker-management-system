const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs/promises");

const db = require("../config/db");

// =====================================================
// DATABASE QUERY PROMISE
// =====================================================

const queryDatabase = (
    sql,
    params = []
) => {
    return new Promise(
        (resolve, reject) => {
            db.query(
                sql,
                params,
                (error, rows) => {
                    if (error) {
                        return reject(error);
                    }

                    resolve(rows);
                }
            );
        }
    );
};
// =====================================================
// CHUẨN HÓA CHUỖI
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
// =====================================================
// LẤY CHI TIẾT THỜI GIAN TRỪ
// =====================================================

const getReportDeductions = async (
    reportIds
) => {
    if (!reportIds.length) {
        return new Map();
    }

    const placeholders =
        reportIds
            .map(() => "?")
            .join(", ");

    const rows =
        await queryDatabase(
            `
                SELECT
                    prd.report_id,
                    dt.id AS deduction_type_id,
                    dt.deduction_code,
                    dt.deduction_name,
                    prd.hours

                FROM production_report_deductions AS prd

                INNER JOIN deduction_types AS dt
                    ON dt.id = prd.deduction_type_id

                WHERE prd.report_id IN (${placeholders})

                ORDER BY
                    prd.report_id ASC,
                    dt.sort_order ASC,
                    dt.id ASC
            `,
            reportIds
        );

    const result = new Map();

    rows.forEach(item => {
        const reportId =
            Number(item.report_id);

        if (!result.has(reportId)) {
            result.set(
                reportId,
                []
            );
        }

        result.get(reportId).push({
            deduction_type_id:
                Number(
                    item.deduction_type_id
                ),
            deduction_code:
                item.deduction_code || "",
            deduction_name:
                item.deduction_name || "",
            hours:
                Number(item.hours) || 0
        });
    });

    return result;
};


// =====================================================
// LẤY CHI TIẾT LỖI NG
// =====================================================

const getReportDefects = async (
    reportIds
) => {
    if (!reportIds.length) {
        return new Map();
    }

    const placeholders =
        reportIds
            .map(() => "?")
            .join(", ");

    const rows =
        await queryDatabase(
            `
                SELECT
                    prd.report_id,
                    dt.id AS defect_type_id,
                    dt.defect_code,
                    dt.defect_name,
                    prd.quantity

                FROM production_report_defects AS prd

                INNER JOIN defect_types AS dt
                    ON dt.id = prd.defect_type_id

                WHERE prd.report_id IN (${placeholders})

                ORDER BY
                    prd.report_id ASC,
                    dt.sort_order ASC,
                    dt.id ASC
            `,
            reportIds
        );

    const result = new Map();

    rows.forEach(item => {
        const reportId =
            Number(item.report_id);

        if (!result.has(reportId)) {
            result.set(
                reportId,
                []
            );
        }

        result.get(reportId).push({
            defect_type_id:
                Number(
                    item.defect_type_id
                ),
            defect_code:
                item.defect_code || "",
            defect_name:
                item.defect_name || "",
            quantity:
                Number(item.quantity) || 0
        });
    });

    return result;
};
// =====================================================
// NORMALIZE SELECTED IDS
// =====================================================

const normalizeIds = (ids) => {
    if (!Array.isArray(ids)) {
        return [];
    }

    return [
        ...new Set(
            ids
                .map(Number)
                .filter(
                    id =>
                        Number.isInteger(id) &&
                        id > 0
                )
        )
    ];
};
// =====================================================
// NUMBER
// =====================================================

const toNumber = (value) => {
    const numberValue = Number(
        String(value ?? 0)
            .replace(/,/g, "")
            .trim()
    );

    return Number.isFinite(numberValue)
        ? numberValue
        : 0;
};


// =====================================================
// DATE
// =====================================================

const toExcelDate = (value) => {
    if (!value) {
        return null;
    }

    if (
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(value)
    ) {
        const [year, month, day] =
            value
                .slice(0, 10)
                .split("-")
                .map(Number);

        return new Date(
            year,
            month - 1,
            day
        );
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? null
        : date;
};


// =====================================================
// FILE NAME DATE
// =====================================================

const formatDateForFileName = (value) => {
    if (!value) {
        return "da-chon";
    }

    if (
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(value)
    ) {
        return value.slice(0, 10);
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "da-chon";
    }

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");

    return `${year}-${month}-${day}`;
};
// =====================================================
// DEEP CLONE OBJECT
// =====================================================

const cloneObject = (value) => {
    if (
        value === null ||
        value === undefined
    ) {
        return value;
    }

    return JSON.parse(
        JSON.stringify(value)
    );
};


// =====================================================
// COPY ROW STYLE
// =====================================================

const copyRowStyle = (
    sheet,
    sourceRowNumber,
    targetRowNumber
) => {
    const sourceRow =
        sheet.getRow(
            sourceRowNumber
        );

    const targetRow =
        sheet.getRow(
            targetRowNumber
        );

    targetRow.height =
        sourceRow.height;

    targetRow.hidden =
        sourceRow.hidden;

    targetRow.outlineLevel =
        sourceRow.outlineLevel;

    const maxColumns = Math.max(
        sheet.columnCount,
        52
    );

    for (
        let columnNumber = 1;
        columnNumber <= maxColumns;
        columnNumber += 1
    ) {
        const sourceCell =
            sourceRow.getCell(
                columnNumber
            );

        const targetCell =
            targetRow.getCell(
                columnNumber
            );

        if (sourceCell.style) {
            targetCell.style =
                cloneObject(
                    sourceCell.style
                );
        }

        if (sourceCell.numFmt) {
            targetCell.numFmt =
                sourceCell.numFmt;
        }

        if (sourceCell.font) {
            targetCell.font =
                cloneObject(
                    sourceCell.font
                );
        }

        if (sourceCell.fill) {
            targetCell.fill =
                cloneObject(
                    sourceCell.fill
                );
        }

        if (sourceCell.border) {
            targetCell.border =
                cloneObject(
                    sourceCell.border
                );
        }

        if (sourceCell.alignment) {
            targetCell.alignment =
                cloneObject(
                    sourceCell.alignment
                );
        }

        if (sourceCell.protection) {
            targetCell.protection =
                cloneObject(
                    sourceCell.protection
                );
        }
    }
};
// =====================================================
// CLEAR OLD TEMPLATE DATA
// =====================================================

const clearTemplateData = (
    sheet,
    startRow
) => {
    const lastRow =
        Math.max(
            sheet.rowCount,
            startRow
        );

    for (
        let rowNumber = startRow;
        rowNumber <= lastRow;
        rowNumber += 1
    ) {
        const row =
            sheet.getRow(
                rowNumber
            );

        for (
            let columnNumber = 1;
            columnNumber <= 52;
            columnNumber += 1
        ) {
            row.getCell(
                columnNumber
            ).value = null;
        }
    }
};


// =====================================================
// TÌM THỜI GIAN TRỪ
// =====================================================

const getDeductionHours = (
    report,
    aliases
) => {
    const normalizedAliases =
        aliases.map(
            normalizeText
        );

    const item =
        (report.deductions || [])
            .find(detail => {
                const code =
                    normalizeText(
                        detail.deduction_code
                    );

                const name =
                    normalizeText(
                        detail.deduction_name
                    );

                return normalizedAliases.some(
                    alias =>
                        alias === code ||
                        alias === name ||
                        name.includes(alias)
                );
            });

    return Number(
        item?.hours
    ) || 0;
};


// =====================================================
// TÌM SỐ LƯỢNG LỖI
// =====================================================

const getDefectQuantity = (
    report,
    aliases
) => {
    const normalizedAliases =
        aliases.map(
            normalizeText
        );

    const item =
        (report.defects || [])
            .find(detail => {
                const code =
                    normalizeText(
                        detail.defect_code
                    );

                const name =
                    normalizeText(
                        detail.defect_name
                    );

                return normalizedAliases.some(
                    alias =>
                        alias === code ||
                        alias === name ||
                        name.includes(alias)
                );
            });

    return Number(
        item?.quantity
    ) || 0;
};
// =====================================================
// WRITE REPORT TO "CẮT LỒNG"
// =====================================================

const writeReportToRow = (
    sheet,
    report,
    rowNumber,
    index
) => {
    const row =
        sheet.getRow(rowNumber);

    // A - STT
    row.getCell("A").value =
        index + 1;

    // B - Worker code
    row.getCell("B").value =
        report.worker_code || "";

    // C - Full name
    row.getCell("C").value =
        report.full_name || "";

    // D - Machine
    row.getCell("D").value =
        report.machine_no || "";

    // E - Shift
    row.getCell("E").value =
        report.shift || "";

    // F - Coefficient
    row.getCell("F").value =
        toNumber(
            report.training_percent || 100
        ) / 100;

    // G - Total time
    row.getCell("G").value =
        toNumber(
            report.total_time
        );

    // H - Actual time
    row.getCell("H").value =
        toNumber(
            report.actual_time
        );

    // I - Empty
    row.getCell("I").value = "";

    // J - Total deduction
    row.getCell("J").value =
        toNumber(
            report.deduction_time
        );


    // =================================================
    // K-Y: 15 DEDUCTION TYPES
    // =================================================

    // K - Thiếu sản lượng
row.getCell("K").value =
    getDeductionHours(
        report,
        [
            "THIEU_SP",
            "Thiếu sản lượng"
        ]
    );

// L - Bật máy, xét máy
row.getCell("L").value =
    getDeductionHours(
        report,
        [
            "BAT_MAY",
            "Bật máy, xét máy"
        ]
    );

// M - Chuyển mã
row.getCell("M").value =
    getDeductionHours(
        report,
        [
            "CHUYEN_MA",
            "Chuyển mã"
        ]
    );

// N - Chỉnh máy
row.getCell("N").value =
    getDeductionHours(
        report,
        [
            "CHINH_MAY",
            "Chỉnh máy"
        ]
    );

// O - Chờ chỉnh máy
row.getCell("O").value =
    getDeductionHours(
        report,
        [
            "CHO_CHINH_MAY",
            "Chờ chỉnh máy"
        ]
    );

// P - Mất điện
row.getCell("P").value =
    getDeductionHours(
        report,
        [
            "MAT_DIEN",
            "Mất điện"
        ]
    );

// Q - Mất khí
row.getCell("Q").value =
    getDeductionHours(
        report,
        [
            "MAT_KHI",
            "Mất khí"
        ]
    );

// R - Chờ hàng
row.getCell("R").value =
    getDeductionHours(
        report,
        [
            "CHO_HANG",
            "Chờ hàng"
        ]
    );

// S - Bảo dưỡng máy
row.getCell("S").value =
    getDeductionHours(
        report,
        [
            "BAO_DUONG",
            "Bảo dưỡng máy"
        ]
    );

// T - Nghỉ giải lao
row.getCell("T").value =
    getDeductionHours(
        report,
        [
            "NGHI_GIAI_LAO",
            "Nghỉ giải lao"
        ]
    );

// U - Giao ca
row.getCell("U").value =
    getDeductionHours(
        report,
        [
            "GIAO_CA",
            "Giao ca"
        ]
    );

// V - Dừng máy đi hỗ trợ
row.getCell("V").value =
    getDeductionHours(
        report,
        [
            "HO_TRO",
            "Dừng máy đi hỗ trợ"
        ]
    );

// W - Giặt/cân/tuốt/tái/GL
row.getCell("W").value =
    getDeductionHours(
        report,
        [
            "GIAT_CAN",
            "Giặt cs/cân cs, tuốt-tái pp, GL"
        ]
    );

// X - 5S
row.getCell("X").value =
    getDeductionHours(
        report,
        [
            "5S",
            "5s"
        ]
    );

// Y - Học việc, đào tạo
row.getCell("Y").value =
    getDeductionHours(
        report,
        [
            "HOC_VIEC",
            "Học việc, đào tạo"
        ]
    );

    // Z - Empty
    row.getCell("Z").value = "";


    // =================================================
    // PRODUCT AND RESULT
    // =================================================

    // AA - Product
    row.getCell("AA").value =
        report.product_name || "";

    // AB - Standard output
    row.getCell("AB").value =
        toNumber(
            report.standard_output
        );

    // AG - OK
    row.getCell("AG").value =
        toNumber(
            report.tt_ok
        );

    // AH - NG
    row.getCell("AH").value =
        toNumber(
            report.tt_ng
        );

    // AC - Total output
    row.getCell("AC").value = {
        formula:
            `AG${rowNumber}+AH${rowNumber}`
    };

    // AD - Performance
    row.getCell("AD").value = {
        formula:
            `IFERROR(AC${rowNumber}/AB${rowNumber},0)`
    };

    // AE - Work date
    row.getCell("AE").value =
        toExcelDate(
            report.work_date
        );

    // AF - Output/hour
    row.getCell("AF").value = {
        formula:
            `IFERROR(AC${rowNumber}/H${rowNumber},0)`
    };

    // AI - NG rate
    row.getCell("AI").value = {
        formula:
            `IFERROR(AH${rowNumber}/AC${rowNumber},0)`
    };

    // AJ - Empty
    row.getCell("AJ").value = "";


    // =================================================
    // AK-AV: 12 DEFECT TYPES
    // =================================================

    row.getCell("AK").value =
    getDefectQuantity(
        report,
        [
            "KQD_DAP_LAI",
            "KQĐ dập lại",
            "Dập lại"
        ]
    );

row.getCell("AL").value =
    getDefectQuantity(
        report,
        [
            "KQD_TUOT",
            "KQĐ tuột",
            "Tuột"
        ]
    );

row.getCell("AM").value =
    getDefectQuantity(
        report,
        [
            "VO_DO_LONG",
            "Vỡ do lồng"
        ]
    );

row.getCell("AN").value =
    getDefectQuantity(
        report,
        [
            "XUOC_DO_LONG",
            "Xước do lồng"
        ]
    );

row.getCell("AO").value =
    getDefectQuantity(
        report,
        [
            "CONG_GAY",
            "Cong gãy"
        ]
    );

row.getCell("AP").value =
    getDefectQuantity(
        report,
        [
            "XOAY",
            "Xoay"
        ]
    );

row.getCell("AQ").value =
    getDefectQuantity(
        report,
        [
            "KHONG_DUT",
            "Không đứt"
        ]
    );

row.getCell("AR").value =
    getDefectQuantity(
        report,
        [
            "BAVIA_HUT",
            "Bavia hụt"
        ]
    );

row.getCell("AS").value =
    getDefectQuantity(
        report,
        [
            "PPCM",
            "PPCM"
        ]
    );

row.getCell("AT").value =
    getDefectQuantity(
        report,
        [
            "LOI_CAO_SU",
            "Lỗi cao su"
        ]
    );

row.getCell("AU").value =
    getDefectQuantity(
        report,
        [
            "NG_KICH_THUOC",
            "NG kích thước"
        ]
    );

row.getCell("AV").value =
    getDefectQuantity(
        report,
        [
            "CAT_LEM",
            "Cắt lẹm"
        ]
    );

    // AW-AX - Trống
    row.getCell("AW").value = "";
    row.getCell("AX").value = "";

    // AY - Trạng thái (giống Google Sheet)
    row.getCell("AY").value = "approved";

    // AZ - ID báo cáo nội bộ (giống Google Sheet)
    row.getCell("AZ").value = Number(report.id);


    // =================================================
    // NUMBER FORMATS
    // =================================================

    row.getCell("F").numFmt =
        "0.00%";

    row.getCell("AD").numFmt =
        "0.00%";

    row.getCell("AI").numFmt =
        "0.00%";

    row.getCell("AE").numFmt =
        "dd/mm/yyyy";

    row.getCell("AB").numFmt =
        "0.00";

    row.getCell("AC").numFmt =
        "0.00";

    row.getCell("AF").numFmt =
        "0.00";

    row.getCell("AG").numFmt =
        "0.00";

    row.getCell("AH").numFmt =
        "0.00";
};
// =====================================================
// EXCEL TEMPLATE CONFIG
// =====================================================

const normalizeDateKey = (value) => {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const compareReportsForExcel = (first, second) => {
    const dateCompare = normalizeDateKey(first.work_date).localeCompare(normalizeDateKey(second.work_date));
    if (dateCompare !== 0) return dateCompare;
    const workerCompare = String(first.worker_code || "").localeCompare(
        String(second.worker_code || ""),
        undefined,
        { numeric: true, sensitivity: "base" }
    );
    if (workerCompare !== 0) return workerCompare;
    return Number(first.id) - Number(second.id);
};

const writeDateSeparatorRow = (sheet, rowNumber, value) => {
    copyRowStyle(sheet, STYLE_SOURCE_ROW, rowNumber);
    const row = sheet.getRow(rowNumber);
    for (let column = 1; column <= 52; column += 1) row.getCell(column).value = null;
    row.getCell("A").value = formatWorkDate(value);
    row.getCell("A").font = { ...(row.getCell("A").font || {}), bold: true };
};

const EXCEL_TEMPLATE_PATH = path.join(
    __dirname,
    "../templates/bao-cao-san-xuat-mau.xlsx"
);

const EXCEL_SHEET_NAME = "Cắt lồng";

// Dòng chứa tiêu đề cột.
// Nếu file mẫu có tiêu đề ở dòng khác thì sửa số này.
const HEADER_ROW_NUMBER = 326;

// Dòng đầu tiên dùng để ghi dữ liệu.
const DATA_START_ROW = HEADER_ROW_NUMBER + 1;

// Dòng mẫu dùng để sao chép định dạng.
// Thường chính là dòng đầu tiên dưới tiêu đề.
const STYLE_SOURCE_ROW = DATA_START_ROW;
// =====================================================




// =====================================================
// ĐỊNH DẠNG NGÀY DD/MM/YYYY
// =====================================================

const formatWorkDate = (value) => {
    if (!value) {
        return "";
    }

    if (
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(value)
    ) {
        const [year, month, day] =
            value
                .slice(0, 10)
                .split("-");

        return `${day}/${month}/${year}`;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    const day = String(
        date.getDate()
    ).padStart(2, "0");

    const month = String(
        date.getMonth() + 1
    ).padStart(2, "0");

    return `${day}/${month}/${date.getFullYear()}`;
};


// =====================================================
// XUẤT FILE EXCEL
//
// GET /api/reports/export-excel
// ?date=2026-07-16
// &type=pending
// =====================================================

// =====================================================
// XUẤT EXCEL CÁC BÁO CÁO ĐÃ DUYỆT ĐƯỢC CHỌN
//
// POST /api/reports/export-excel
// Body:
// {
//     "ids": [1, 2, 3]
// }
// =====================================================
// =====================================================
// EXPORT SELECTED APPROVED REPORTS INTO EXCEL TEMPLATE
//
// POST /api/reports/export-excel
//
// Body:
// {
//     "ids": [1, 2, 3]
// }
// =====================================================

exports.exportGiaCongExcel = async (
    req,
    res
) => {
    try {
        const ids =
            normalizeIds(
                req.body?.ids
            );

        if (ids.length === 0) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng chọn ít nhất một báo cáo"
            });
        }


        // =============================================
        // CHECK TEMPLATE
        // =============================================

        try {
            await fs.access(
                EXCEL_TEMPLATE_PATH
            );
        }
        catch {
            return res.status(500).json({
                success: false,
                message:
                    "Không tìm thấy file Excel mẫu",
                templatePath:
                    EXCEL_TEMPLATE_PATH
            });
        }


        // =============================================
        // LOAD REPORTS
        // =============================================

        const placeholders =
            ids
                .map(() => "?")
                .join(", ");

        const sql = `
            SELECT
                pr.*,

                w.worker_code,
                w.training_percent,

                u.full_name,

                p.process_name

            FROM production_reports AS pr

            INNER JOIN workers AS w
                ON w.id = pr.worker_id

            INNER JOIN users AS u
                ON u.id = w.user_id

            LEFT JOIN processes AS p
                ON p.id = pr.process_id

            WHERE pr.id IN (${placeholders})

            ORDER BY
                pr.work_date ASC,
                w.worker_code ASC,
                pr.machine_no ASC,
                pr.created_at ASC
        `;

        const reports =
            await queryDatabase(
                sql,
                ids
            );
const reportIds =
    reports.map(
        report =>
            Number(report.id)
    );

const [
    deductionsMap,
    defectsMap
] = await Promise.all([
    getReportDeductions(
        reportIds
    ),
    getReportDefects(
        reportIds
    )
]);

reports.forEach(report => {
    const reportId =
        Number(report.id);

    report.deductions =
        deductionsMap.get(
            reportId
        ) || [];

    report.defects =
        defectsMap.get(
            reportId
        ) || [];
});


if (reports.length === 0) {
    return res.status(404).json({
        success: false,
        message:
            "Không tìm thấy báo cáo đã chọn"
    });
}

        // =============================================
        // VERIFY ALL IDS
        // =============================================

        const foundIds = new Set(
            reports.map(
                report =>
                    Number(report.id)
            )
        );

        const missingIds =
            ids.filter(
                id =>
                    !foundIds.has(id)
            );

        if (missingIds.length > 0) {
            return res.status(400).json({
                success: false,
                message:
                    "Một số báo cáo không tồn tại",
                missingIds
            });
        }


        // =============================================
        // READ TEMPLATE INTO MEMORY
        // File gốc không bị thay đổi
        // =============================================

        const templateBuffer =
            await fs.readFile(
                EXCEL_TEMPLATE_PATH
            );

        const workbook =
            new ExcelJS.Workbook();

        await workbook.xlsx.load(
            templateBuffer
        );


        // =============================================
        // GET "CẮT LỒNG" SHEET
        // =============================================

        const sheet =
            workbook.getWorksheet(
                EXCEL_SHEET_NAME
            );

        if (!sheet) {
            return res.status(500).json({
                success: false,
                message:
                    `Không tìm thấy sheet "${EXCEL_SHEET_NAME}" trong file mẫu`,
                availableSheets:
                    workbook.worksheets.map(
                        item => item.name
                    )
            });
        }


        // =============================================
        // STORE SOURCE STYLE BEFORE CLEAR
        // =============================================

        const styleSourceRow =
            sheet.getRow(
                STYLE_SOURCE_ROW
            );

        if (!styleSourceRow) {
            throw new Error(
                `Không tìm thấy dòng mẫu ${STYLE_SOURCE_ROW}`
            );
        }


        // =============================================
        // CLEAR OLD DATA IN WORKBOOK COPY
        // =============================================

        clearTemplateData(
            sheet,
            DATA_START_ROW
        );


        // =============================================
        // INSERT SELECTED REPORTS
        // =============================================

        reports.sort(compareReportsForExcel);

        let outputRow = DATA_START_ROW;
        let currentDate = "";
        let sequenceNumber = 0;

        reports.forEach((report) => {
            const dateKey = normalizeDateKey(report.work_date);

            if (dateKey !== currentDate) {
                currentDate = dateKey;
                sequenceNumber = 0;
                writeDateSeparatorRow(sheet, outputRow, report.work_date);
                outputRow += 1;
            }

            sequenceNumber += 1;
            copyRowStyle(sheet, STYLE_SOURCE_ROW, outputRow);
            writeReportToRow(sheet, report, outputRow, sequenceNumber - 1);
            outputRow += 1;
        });


        // =============================================
        // CALCULATION SETTINGS
        // =============================================

        workbook.calcProperties.fullCalcOnLoad =
            true;

        workbook.calcProperties.forceFullCalc =
            true;

        workbook.calcProperties.calcMode =
            "auto";


        // =============================================
        // OUTPUT FILE NAME
        // =============================================

        const reportDates = [
            ...new Set(
                reports.map(
                    report =>
                        formatDateForFileName(
                            report.work_date
                        )
                )
            )
        ];

        const datePart =
            reportDates.length === 1
                ? reportDates[0]
                : "nhieu-ngay";

        const fileName =
            `bao-cao-cat-long-${datePart}.xlsx`;


        // =============================================
        // WRITE COPY TO BUFFER
        // =============================================

        const outputBuffer =
            await workbook.xlsx.writeBuffer();


        // =============================================
        // RESPONSE
        // =============================================

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fileName}"`
        );

        res.setHeader(
            "Access-Control-Expose-Headers",
            "Content-Disposition"
        );

        return res.status(200).send(
            Buffer.from(outputBuffer)
        );
    }
    catch (error) {
        console.error(
            "EXPORT EXCEL TEMPLATE ERROR:",
            error
        );

        if (res.headersSent) {
            return res.end();
        }

        return res.status(500).json({
            success: false,
            message:
                "Không thể xuất file Excel",
            error:
                error.sqlMessage ||
                error.message
        });
    }
};