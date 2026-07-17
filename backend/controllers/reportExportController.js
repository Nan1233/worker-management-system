const ExcelJS = require("exceljs");

const db = require("../config/db");

// const GoogleSheetService = require(
//     "../services/googleSheetService"
// );


// =====================================================
// CHẠY CÂU LỆNH SQL DƯỚI DẠNG PROMISE
// =====================================================

const queryDatabase = (sql, params = []) => {

    return new Promise((resolve, reject) => {

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

    });

};


// =====================================================
// KIỂM TRA NGÀY YYYY-MM-DD
// =====================================================

const isValidDate = (date) => {

    if (
        typeof date !== "string"
        || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {

        return false;

    }

    const [
        year,
        month,
        day
    ] = date
        .split("-")
        .map(Number);

    const parsedDate = new Date(
        year,
        month - 1,
        day
    );

    return (
        parsedDate.getFullYear() === year
        && parsedDate.getMonth() === month - 1
        && parsedDate.getDate() === day
    );

};


// =====================================================
// CHUYỂN DỮ LIỆU THÀNH SỐ
// =====================================================

const toNumber = (value) => {

    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {

        return 0;

    }

    return numberValue;

};


// =====================================================
// ĐỊNH DẠNG NGÀY DD/MM/YYYY
// =====================================================

const formatWorkDate = (value) => {

    if (!value) {

        return "";

    }

    // Khi MySQL trả về chuỗi YYYY-MM-DD
    if (
        typeof value === "string"
        && /^\d{4}-\d{2}-\d{2}/.test(value)
    ) {

        const datePart = value.slice(0, 10);

        const [
            year,
            month,
            day
        ] = datePart.split("-");

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

    const year = date.getFullYear();

    return `${day}/${month}/${year}`;

};


// =====================================================
// LẤY CÂU SQL PHÙ HỢP VỚI LOẠI BÁO CÁO
// =====================================================

const getReportSql = (type) => {

    /*
        pending:
        lấy dữ liệu trong production_reports_temp

        approved:
        lấy dữ liệu trong production_reports
    */

    const tableName =
        type === "pending"
            ? "production_reports_temp"
            : "production_reports";


    /*
        Chỉ lấy những cột thực sự cần cho file Excel.

        Không lấy:
        - review_note
        - approved_at
        - reviewed_by
        - stop_reason

        để tránh lỗi khi database trên Render/TiDB
        chưa có các cột đó.
    */

    return `

        SELECT

            pr.id,

            pr.work_date,

            pr.shift,

            pr.machine_no,

            pr.product_name,

            pr.total_time,

            pr.actual_time,

            pr.deduction_time,

            pr.standard_output,

            pr.actual_output,

            pr.tt_ok,

            pr.tt_ng,

            pr.note,

            w.worker_code,

            u.full_name,

            p.process_name

        FROM ${tableName} AS pr

        INNER JOIN workers AS w
            ON w.id = pr.worker_id

        INNER JOIN users AS u
            ON u.id = w.user_id

        LEFT JOIN processes AS p
            ON p.id = pr.process_id

        WHERE pr.work_date = ?

        ORDER BY

            p.process_name ASC,

            w.worker_code ASC,

            pr.created_at ASC

    `;

};


// =====================================================
// TẠO WORKSHEET
// =====================================================

const createWorksheet = (
    workbook,
    reports,
    date,
    type
) => {

    const isPending =
        type === "pending";

    const sheetName =
        isPending
            ? "Bao cao cho duyet"
            : "Bao cao da duyet";

    const sheet = workbook.addWorksheet(
        sheetName
    );


    // =================================================
    // THIẾT LẬP ĐỘ RỘNG CỘT
    // =================================================

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


    // =================================================
    // TIÊU ĐỀ
    // =================================================

    sheet.mergeCells("A1:P1");

    const titleCell = sheet.getCell("A1");

    titleCell.value =
        isPending
            ? "BÁO CÁO SẢN XUẤT CHỜ DUYỆT"
            : "BÁO CÁO SẢN XUẤT ĐÃ DUYỆT";

    titleCell.font = {

        bold: true,

        size: 16

    };

    titleCell.alignment = {

        horizontal: "center",

        vertical: "middle"

    };

    sheet.getRow(1).height = 30;


    // =================================================
    // NGÀY BÁO CÁO
    // =================================================

    sheet.mergeCells("A2:P2");

    const dateCell = sheet.getCell("A2");

    const formattedDate =
        formatWorkDate(date);

    dateCell.value =
        `Ngày báo cáo: ${formattedDate}`;

    dateCell.font = {

        bold: true,

        size: 11

    };

    dateCell.alignment = {

        horizontal: "center",

        vertical: "middle"

    };

    sheet.getRow(2).height = 22;


    // =================================================
    // DÒNG HEADER
    // =================================================

    const headerRow = sheet.getRow(4);

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


    // =================================================
    // THÊM DỮ LIỆU
    // =================================================

    reports.forEach((report, index) => {

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

    });


    // =================================================
    // KHÔNG CÓ DỮ LIỆU
    // =================================================

    if (reports.length === 0) {

        sheet.mergeCells("A5:P5");

        const emptyCell = sheet.getCell("A5");

        emptyCell.value =
            isPending
                ? "Không có báo cáo chờ duyệt trong ngày này"
                : "Không có báo cáo đã duyệt trong ngày này";

        emptyCell.font = {

            italic: true

        };

        emptyCell.alignment = {

            horizontal: "center",

            vertical: "middle"

        };

        sheet.getRow(5).height = 28;

    }


    // =================================================
    // BORDER VÀ CĂN CHỈNH
    // =================================================

    const lastRowNumber =
        reports.length > 0
            ? reports.length + 4
            : 5;

    for (
        let rowIndex = 4;
        rowIndex <= lastRowNumber;
        rowIndex += 1
    ) {

        const row = sheet.getRow(rowIndex);

        row.eachCell(
            {
                includeEmpty: true
            },
            (cell) => {

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


    // Căn giữa cột 1 đến cột 15.
    // Cột 16 là ghi chú nên để căn trái.

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

            sheet
                .getCell(
                    rowIndex,
                    columnIndex
                )
                .alignment = {

                    horizontal: "center",

                    vertical: "middle",

                    wrapText: true

                };

        }

    }


    // =================================================
    // ĐÓNG BĂNG HEADER
    // =================================================

    sheet.views = [

        {
            state: "frozen",

            ySplit: 4
        }

    ];


    // =================================================
    // BỘ LỌC
    // =================================================

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

exports.exportGiaCongExcel = async (
    req,
    res
) => {

    try {

        const date = String(
            req.query.date || ""
        ).trim();

        const type = String(
            req.query.type || ""
        )
            .trim()
            .toLowerCase();


        // =============================================
        // VALIDATE NGÀY
        // =============================================

        if (!date) {

            return res.status(400).json({

                success: false,

                message:
                    "Thiếu ngày xuất báo cáo"

            });

        }

        if (!isValidDate(date)) {

            return res.status(400).json({

                success: false,

                message:
                    "Ngày không hợp lệ. Định dạng yêu cầu: YYYY-MM-DD"

            });

        }


        // =============================================
        // VALIDATE LOẠI BÁO CÁO
        // =============================================

        if (
            type !== "pending"
            && type !== "approved"
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Loại báo cáo không hợp lệ. Chỉ chấp nhận pending hoặc approved"

            });

        }


        console.log(
            "EXPORT EXCEL REQUEST:",
            {
                date,
                type,
                userId:
                    req.user?.id,
                role:
                    req.user?.role
            }
        );


        // =============================================
        // TRUY VẤN DATABASE
        // =============================================

        const sql = getReportSql(type);

        const reports = await queryDatabase(
            sql,
            [date]
        );


        console.log(
            "EXPORT EXCEL DATA:",
            {
                date,
                type,
                total:
                    reports.length
            }
        );


        // =============================================
        // TẠO FILE EXCEL
        // =============================================

        const workbook =
            new ExcelJS.Workbook();

        workbook.creator =
            "Worker Management System";

        workbook.lastModifiedBy =
            "Worker Management System";

        workbook.created =
            new Date();

        workbook.modified =
            new Date();

        createWorksheet(
            workbook,
            reports,
            date,
            type
        );


        // =============================================
        // TÊN FILE
        // =============================================

        const filePrefix =
            type === "pending"
                ? "bao-cao-cho-duyet"
                : "bao-cao-da-duyet";

        const fileName =
            `${filePrefix}-${date}.xlsx`;


        // =============================================
        // HEADER RESPONSE
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


        // =============================================
        // GỬI FILE
        // =============================================

        await workbook.xlsx.write(res);

        return res.end();

    }
    catch (error) {

        console.error(
            "EXPORT EXCEL ERROR:"
        );

        console.error(
            "Message:",
            error.message
        );

        console.error(
            "Code:",
            error.code
        );

        console.error(
            "SQL Message:",
            error.sqlMessage
        );

        console.error(
            "SQL:",
            error.sql
        );

        console.error(
            "Stack:",
            error.stack
        );


        if (res.headersSent) {

            return res.end();

        }


        return res.status(500).json({

            success: false,

            message:
                "Không thể xuất file Excel",

            error:
                error.sqlMessage
                || error.message

        });

    }

};

