const ExcelJS = require("exceljs");

const db = require("../config/db");

const GoogleSheetService = require(
    "../services/googleSheetService"
);


// =====================================================
// CHUYỂN DB QUERY THÀNH PROMISE
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

                resolve(rows);

            }
        );

    });

};


// =====================================================
// KIỂM TRA ĐỊNH DẠNG NGÀY YYYY-MM-DD
// =====================================================

const isValidDate = (date) => {

    if (
        typeof date !== "string"
        || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
        return false;
    }

    const parsedDate = new Date(`${date}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime())) {
        return false;
    }

    const [
        year,
        month,
        day
    ] = date
        .split("-")
        .map(Number);

    return (
        parsedDate.getFullYear() === year
        && parsedDate.getMonth() + 1 === month
        && parsedDate.getDate() === day
    );

};


// =====================================================
// CHUẨN HÓA NGÀY HIỂN THỊ TRONG EXCEL
// =====================================================

const formatDateForExcel = (value) => {

    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    const day = String(date.getDate()).padStart(2, "0");

    const month = String(
        date.getMonth() + 1
    ).padStart(2, "0");

    const year = date.getFullYear();

    return `${day}/${month}/${year}`;

};


// =====================================================
// CHUẨN HÓA GIÁ TRỊ SỐ
// =====================================================

const toNumber = (value) => {

    const numberValue = Number(value);

    if (Number.isNaN(numberValue)) {
        return 0;
    }

    return numberValue;

};


// =====================================================
// TẠO SQL THEO TRẠNG THÁI
//
// pending:
// production_reports_temp
//
// approved:
// production_reports
// =====================================================

const buildReportQuery = (type) => {

    const tableName =
        type === "pending"
            ? "production_reports_temp"
            : "production_reports";

    const statusCondition =
        type === "pending"
            ? "AND pr.status = 'pending'"
            : "AND pr.status = 'approved'";

    return `

        SELECT

            pr.id,

            pr.worker_id,

            pr.process_id,

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

            pr.status,

            pr.review_note,

            pr.approved_at,

            pr.created_at,

            w.worker_code,

            u.full_name,

            p.process_name

        FROM ${tableName} pr

        INNER JOIN workers w
            ON pr.worker_id = w.id

        INNER JOIN users u
            ON w.user_id = u.id

        LEFT JOIN processes p
            ON pr.process_id = p.id

        WHERE DATE(pr.work_date) = ?

        ${statusCondition}

        ORDER BY

            p.process_name ASC,

            w.worker_code ASC,

            pr.created_at ASC

    `;

};


// =====================================================
// THÊM DỮ LIỆU VÀO FILE EXCEL
// =====================================================

const createReportWorksheet = (
    workbook,
    reports,
    type,
    date
) => {

    const worksheetName =
        type === "pending"
            ? "Bao Cao Cho Duyet"
            : "Bao Cao Da Duyet";

    const sheet = workbook.addWorksheet(
        worksheetName
    );


    // =================================================
    // TIÊU ĐỀ
    // =================================================

    sheet.mergeCells("A1:P1");

    const titleCell = sheet.getCell("A1");

    titleCell.value =
        type === "pending"
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

    sheet.getRow(1).height = 28;


    // =================================================
    // NGÀY BÁO CÁO
    // =================================================

    sheet.mergeCells("A2:P2");

    const dateCell = sheet.getCell("A2");

    dateCell.value = `Ngày báo cáo: ${date}`;

    dateCell.font = {
        bold: true,
        size: 11
    };

    dateCell.alignment = {
        horizontal: "center",
        vertical: "middle"
    };


    // =================================================
    // CỘT EXCEL
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
            width: 15
        },

        {
            key: "shift",
            width: 12
        },

        {
            key: "machine_no",
            width: 15
        },

        {
            key: "product_name",
            width: 25
        },

        {
            key: "total_time",
            width: 14
        },

        {
            key: "actual_time",
            width: 14
        },

        {
            key: "deduction_time",
            width: 14
        },

        {
            key: "standard_output",
            width: 16
        },

        {
            key: "actual_output",
            width: 16
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
            width: 35
        }

    ];


    // =================================================
    // HEADER
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

    headerRow.height = 32;


    // =================================================
    // DỮ LIỆU
    // =================================================

    reports.forEach((item, index) => {

        sheet.addRow({

            stt:
                index + 1,

            worker_code:
                item.worker_code || "",

            full_name:
                item.full_name || "",

            process_name:
                item.process_name || "",

            work_date:
                formatDateForExcel(item.work_date),

            shift:
                item.shift || "",

            machine_no:
                item.machine_no || "",

            product_name:
                item.product_name || "",

            total_time:
                toNumber(item.total_time),

            actual_time:
                toNumber(item.actual_time),

            deduction_time:
                toNumber(item.deduction_time),

            standard_output:
                toNumber(item.standard_output),

            actual_output:
                toNumber(item.actual_output),

            tt_ok:
                toNumber(item.tt_ok),

            tt_ng:
                toNumber(item.tt_ng),

            note:
                item.note || ""

        });

    });


    // =================================================
    // DÒNG KHI KHÔNG CÓ DỮ LIỆU
    // =================================================

    if (reports.length === 0) {

        sheet.mergeCells("A5:P5");

        const emptyCell = sheet.getCell("A5");

        emptyCell.value =
            type === "pending"
                ? "Không có báo cáo chờ duyệt trong ngày này"
                : "Không có báo cáo đã duyệt trong ngày này";

        emptyCell.alignment = {
            horizontal: "center",
            vertical: "middle"
        };

        emptyCell.font = {
            italic: true
        };

    }


    // =================================================
    // BORDER VÀ CĂN CHỈNH
    // =================================================

    const lastRow =
        reports.length > 0
            ? reports.length + 4
            : 5;

    for (
        let rowIndex = 4;
        rowIndex <= lastRow;
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


    // Căn giữa các cột không phải ghi chú

    for (
        let rowIndex = 5;
        rowIndex <= lastRow;
        rowIndex += 1
    ) {

        for (
            let columnIndex = 1;
            columnIndex <= 15;
            columnIndex += 1
        ) {

            sheet
                .getCell(rowIndex, columnIndex)
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
// XUẤT EXCEL
//
// GET:
// /api/reports/export-excel
// ?date=2026-07-16
// &type=pending
// =====================================================

exports.exportGiaCongExcel = async (req, res) => {

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
        // KIỂM TRA NGÀY
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
                    "Ngày không hợp lệ. Định dạng yêu cầu là YYYY-MM-DD"

            });

        }


        // =============================================
        // KIỂM TRA LOẠI BÁO CÁO
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


        // =============================================
        // LẤY DỮ LIỆU
        // =============================================

        const sql = buildReportQuery(type);

        const reports = await queryDatabase(
            sql,
            [date]
        );


        // =============================================
        // TẠO WORKBOOK
        // =============================================

        const workbook =
            new ExcelJS.Workbook();

        workbook.creator =
            "Worker Management System";

        workbook.created =
            new Date();

        workbook.modified =
            new Date();


        createReportWorksheet(
            workbook,
            reports,
            type,
            date
        );


        // =============================================
        // TÊN FILE
        // =============================================

        const filePrefix =
            type === "pending"
                ? "BaoCaoChoDuyet"
                : "BaoCaoDaDuyet";

        const fileName =
            `${filePrefix}_${date}.xlsx`;


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
            "EXPORT EXCEL ERROR:",
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
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined

        });

    }

};


// =====================================================
// ĐỒNG BỘ GOOGLE SHEET
//
// GET /api/reports/google-sheet?date=2026-07-16
// =====================================================

exports.exportGoogleSheet = async (req, res) => {

    try {

        const date = String(
            req.query.date || ""
        ).trim();


        if (!date) {

            return res.status(400).json({

                success: false,

                message: "Thiếu ngày"

            });

        }


        if (!isValidDate(date)) {

            return res.status(400).json({

                success: false,

                message:
                    "Ngày không hợp lệ. Định dạng yêu cầu là YYYY-MM-DD"

            });

        }


        const result =
            await GoogleSheetService
                .syncProductionReport(date);


        return res.status(200).json({

            success: true,

            message:
                "Cập nhật Google Sheet thành công",

            url:
                result.url

        });

    }
    catch (error) {

        console.error(
            "EXPORT GOOGLE SHEET ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                error.message
                || "Không thể cập nhật Google Sheet"

        });

    }

};


// =====================================================
// TẠO GOOGLE SHEET
//
// POST /api/reports/create-sheet
// Body:
// {
//     "date": "2026-07-16"
// }
// =====================================================

exports.createGoogleSheet = async (req, res) => {

    try {

        const date = String(
            req.body?.date || ""
        ).trim();


        if (!date) {

            return res.status(400).json({

                success: false,

                message: "Thiếu ngày"

            });

        }


        if (!isValidDate(date)) {

            return res.status(400).json({

                success: false,

                message:
                    "Ngày không hợp lệ. Định dạng yêu cầu là YYYY-MM-DD"

            });

        }


        const result =
            await GoogleSheetService
                .createSheet(date);


        return res.status(200).json({

            success: true,

            message:
                "Tạo Google Sheet thành công",

            url:
                result.url

        });

    }
    catch (error) {

        console.error(
            "CREATE GOOGLE SHEET ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                error.message
                || "Không thể tạo Google Sheet"

        });

    }

};


// =====================================================
// CẬP NHẬT GOOGLE SHEET
//
// POST /api/reports/update-sheet
// Body:
// {
//     "date": "2026-07-16"
// }
// =====================================================

exports.updateGoogleSheet = async (req, res) => {

    try {

        const date = String(
            req.body?.date || ""
        ).trim();


        if (!date) {

            return res.status(400).json({

                success: false,

                message: "Thiếu ngày"

            });

        }


        if (!isValidDate(date)) {

            return res.status(400).json({

                success: false,

                message:
                    "Ngày không hợp lệ. Định dạng yêu cầu là YYYY-MM-DD"

            });

        }


        const result =
            await GoogleSheetService
                .updateSheet(date);


        return res.status(200).json({

            success: true,

            message:
                "Cập nhật Google Sheet thành công",

            url:
                result.url

        });

    }
    catch (error) {

        console.error(
            "UPDATE GOOGLE SHEET ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                error.message
                || "Không thể cập nhật Google Sheet"

        });

    }

};