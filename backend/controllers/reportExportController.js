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

    row.getCell("K").value =
        toNumber(
            report.thieu_san_luong
        );

    row.getCell("L").value =
        toNumber(
            report.bat_may_xet_may
        );

    row.getCell("M").value =
        toNumber(
            report.chuyen_ma
        );

    row.getCell("N").value =
        toNumber(
            report.chinh_may
        );

    row.getCell("O").value =
        toNumber(
            report.cho_chinh_may
        );

    row.getCell("P").value =
        toNumber(
            report.mat_dien
        );

    row.getCell("Q").value =
        toNumber(
            report.mat_khi
        );

    row.getCell("R").value =
        toNumber(
            report.cho_hang
        );

    row.getCell("S").value =
        toNumber(
            report.bao_duong_may
        );

    row.getCell("T").value =
        toNumber(
            report.nghi_giai_lao
        );

    row.getCell("U").value =
        toNumber(
            report.giao_ca
        );

    row.getCell("V").value =
        toNumber(
            report.dung_may_ho_tro
        );

    row.getCell("W").value =
        toNumber(
            report.giat_can_tuot_tai_gl
        );

    row.getCell("X").value =
        toNumber(
            report.five_s
        );

    row.getCell("Y").value =
        toNumber(
            report.hoc_viec_dao_tao
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
        toNumber(
            report.kqd_dap_lai
        );

    row.getCell("AL").value =
        toNumber(
            report.kqd_tuot
        );

    row.getCell("AM").value =
        toNumber(
            report.vo_do_long
        );

    row.getCell("AN").value =
        toNumber(
            report.xuoc_do_long
        );

    row.getCell("AO").value =
        toNumber(
            report.cong_gay
        );

    row.getCell("AP").value =
        toNumber(
            report.xoay
        );

    row.getCell("AQ").value =
        toNumber(
            report.khong_dut
        );

    row.getCell("AR").value =
        toNumber(
            report.bavia_hut
        );

    row.getCell("AS").value =
        toNumber(
            report.ppcm
        );

    row.getCell("AT").value =
        toNumber(
            report.loi_cao_su
        );

    row.getCell("AU").value =
        toNumber(
            report.ng_kich_thuoc
        );

    row.getCell("AV").value =
        toNumber(
            report.cat_lem
        );

    // AW-AY
    row.getCell("AW").value = "";
    row.getCell("AX").value = "";
    row.getCell("AY").value = "";

    // AZ - Status
    row.getCell("AZ").value =
        "approved";


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
// CHẠY SQL DƯỚI DẠNG PROMISE
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

                    return resolve(rows);
                }
            );
        }
    );
};


// =====================================================
// CHUYỂN DỮ LIỆU THÀNH SỐ
// =====================================================

const toNumber = (value) => {
    const numberValue = Number(value);

    return Number.isFinite(numberValue)
        ? numberValue
        : 0;
};


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
// CHUYỂN NGÀY VỀ YYYY-MM-DD ĐỂ ĐẶT TÊN FILE
// =====================================================

const normalizeDateForFileName = (
    value
) => {
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

    const year = date.getFullYear();

    const month = String(
        date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
};


// =====================================================
// LẤY DANH SÁCH ID HỢP LỆ
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
// TẠO WORKSHEET EXCEL
// =====================================================

const createWorksheet = (
    workbook,
    reports
) => {
    const sheet =
        workbook.addWorksheet(
            "Bao cao da duyet"
        );

    sheet.columns = [
        {
            key: "stt",
            width: 8
        },
        {
            key: "worker_code",
            width: 16
        },
        {
            key: "full_name",
            width: 24
        },
        {
            key: "process_name",
            width: 20
        },
        {
            key: "work_date",
            width: 16
        },
        {
            key: "shift",
            width: 12
        },
        {
            key: "machine_no",
            width: 16
        },
        {
            key: "product_name",
            width: 26
        },
        {
            key: "total_time",
            width: 16
        },
        {
            key: "actual_time",
            width: 18
        },
        {
            key: "deduction_time",
            width: 16
        },
        {
            key: "standard_output",
            width: 18
        },
        {
            key: "actual_output",
            width: 18
        },
        {
            key: "tt_ok",
            width: 12
        },
        {
            key: "tt_ng",
            width: 12
        },
        {
            key: "note",
            width: 36
        }
    ];

    sheet.mergeCells("A1:P1");

    const titleCell =
        sheet.getCell("A1");

    titleCell.value =
        "BÁO CÁO SẢN XUẤT ĐÃ DUYỆT";

    titleCell.font = {
        bold: true,
        size: 16
    };

    titleCell.alignment = {
        horizontal: "center",
        vertical: "middle"
    };

    sheet.getRow(1).height = 30;

    sheet.mergeCells("A2:P2");

    const dateValues = [
        ...new Set(
            reports
                .map(report =>
                    formatWorkDate(
                        report.work_date
                    )
                )
                .filter(Boolean)
        )
    ];

    const dateCell =
        sheet.getCell("A2");

    dateCell.value =
        dateValues.length === 1
            ? `Ngày báo cáo: ${dateValues[0]}`
            : `Các ngày báo cáo: ${dateValues.join(", ")}`;

    dateCell.font = {
        bold: true,
        size: 11
    };

    dateCell.alignment = {
        horizontal: "center",
        vertical: "middle"
    };

    sheet.getRow(2).height = 22;

    const headerRow =
        sheet.getRow(4);

    headerRow.values = [
        "STT",
        "Mã công nhân",
        "Tên công nhân",
        "Công đoạn",
        "Ngày làm việc",
        "Ca",
        "Máy",
        "Sản phẩm",
        "Tổng thời gian",
        "Thời gian thực tế",
        "Thời gian trừ",
        "Sản lượng chuẩn",
        "Sản lượng thực tế",
        "TT OK",
        "TT NG",
        "Ghi chú"
    ];

    headerRow.font = {
        bold: true
    };

    headerRow.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true
    };

    headerRow.height = 35;

    reports.forEach(
        (report, index) => {
            sheet.addRow({
                stt:
                    index + 1,

                worker_code:
                    report.worker_code || "",

                full_name:
                    report.full_name || "",

                process_name:
                    report.process_name || "",

                work_date:
                    formatWorkDate(
                        report.work_date
                    ),

                shift:
                    report.shift || "",

                machine_no:
                    report.machine_no || "",

                product_name:
                    report.product_name || "",

                total_time:
                    toNumber(
                        report.total_time
                    ),

                actual_time:
                    toNumber(
                        report.actual_time
                    ),

                deduction_time:
                    toNumber(
                        report.deduction_time
                    ),

                standard_output:
                    toNumber(
                        report.standard_output
                    ),

                actual_output:
                    toNumber(
                        report.actual_output
                    ),

                tt_ok:
                    toNumber(
                        report.tt_ok
                    ),

                tt_ng:
                    toNumber(
                        report.tt_ng
                    ),

                note:
                    report.note || ""
            });
        }
    );

    const lastRowNumber =
        reports.length + 4;

    for (
        let rowIndex = 4;
        rowIndex <= lastRowNumber;
        rowIndex += 1
    ) {
        const row =
            sheet.getRow(rowIndex);

        row.eachCell(
            {
                includeEmpty: true
            },
            cell => {
                cell.border = {
                    top: {
                        style: "thin"
                    },
                    left: {
                        style: "thin"
                    },
                    bottom: {
                        style: "thin"
                    },
                    right: {
                        style: "thin"
                    }
                };

                cell.alignment = {
                    vertical: "middle",
                    wrapText: true
                };
            }
        );
    }

    for (
        let rowIndex = 5;
        rowIndex <= lastRowNumber;
        rowIndex += 1
    ) {
        for (
            let columnIndex = 1;
            columnIndex <= 15;
            columnIndex += 1
        ) {
            sheet.getCell(
                rowIndex,
                columnIndex
            ).alignment = {
                horizontal: "center",
                vertical: "middle",
                wrapText: true
            };
        }
    }

    sheet.views = [
        {
            state: "frozen",
            ySplit: 4
        }
    ];

    sheet.autoFilter = {
        from: "A4",
        to: "P4"
    };

    return sheet;
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

        reports.forEach(
            (report, index) => {
                const rowNumber =
                    DATA_START_ROW +
                    index;

                copyRowStyle(
                    sheet,
                    STYLE_SOURCE_ROW,
                    rowNumber
                );

                writeReportToRow(
                    sheet,
                    report,
                    rowNumber,
                    index
                );
            }
        );


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