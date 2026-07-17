const ExcelJS = require("exceljs");

const db = require("../config/db");

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

exports.exportGiaCongExcel = async (
    req,
    res
) => {
    try {
        const ids = normalizeIds(
            req.body?.ids
        );

        if (ids.length === 0) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng chọn ít nhất một báo cáo đã duyệt"
            });
        }

        const placeholders =
            ids
                .map(() => "?")
                .join(", ");

        const sql = `
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
                pr.created_at,

                w.worker_code,

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
                p.process_name ASC,
                w.worker_code ASC,
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
                    "Không tìm thấy báo cáo đã duyệt được chọn"
            });
        }

        const foundIdSet = new Set(
            reports.map(
                report =>
                    Number(report.id)
            )
        );

        const missingIds =
            ids.filter(
                id =>
                    !foundIdSet.has(id)
            );

        if (missingIds.length > 0) {
            return res.status(400).json({
                success: false,
                message:
                    "Một số báo cáo không tồn tại hoặc chưa được duyệt",
                missingIds
            });
        }

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
            reports
        );

        const dateValues = [
            ...new Set(
                reports.map(
                    report =>
                        normalizeDateForFileName(
                            report.work_date
                        )
                )
            )
        ];

        const fileDate =
            dateValues.length === 1
                ? dateValues[0]
                : "nhieu-ngay";

        const fileName =
            `bao-cao-da-duyet-${fileDate}.xlsx`;

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

        await workbook.xlsx.write(res);

        return res.end();
    }
    catch (error) {
        console.error(
            "EXPORT SELECTED APPROVED EXCEL ERROR:",
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