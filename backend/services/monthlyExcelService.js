const ExcelJS = require("exceljs");
const fs = require("fs/promises");
const path = require("path");
const db = require("../config/db");

const query = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

const safeSheetName = (name) => String(name || "Công đoạn").replace(/[\\/*?:[\]]/g, "-").slice(0, 31);

const loadMonthReports = async (yearMonth) => query(
    `SELECT pr.*, w.worker_code, u.full_name, p.process_name
     FROM production_reports pr
     JOIN workers w ON w.id = pr.worker_id
     JOIN users u ON u.id = w.user_id
     JOIN processes p ON p.id = pr.process_id
     WHERE pr.status = 'approved' AND DATE_FORMAT(pr.work_date, '%Y-%m') = ?
     ORDER BY p.id, pr.work_date, w.worker_code, pr.created_at`,
    [yearMonth]
);

const buildMonthlyWorkbook = async (yearMonth) => {
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error("Tháng không hợp lệ");
    const reports = await loadMonthReports(yearMonth);
    const root = process.env.EXCEL_EXPORT_ROOT || path.join(process.cwd(), "exports");
    const year = yearMonth.slice(0, 4);
    const folder = path.join(root, year);
    const target = path.join(folder, `Bao-cao-san-xuat-${yearMonth}.xlsx`);
    const temporary = `${target}.${Date.now()}.tmp`;
    await fs.mkdir(folder, { recursive: true });

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: temporary, useStyles: true, useSharedStrings: true });
    const grouped = new Map();
    for (const report of reports) {
        const key = `${report.process_id}:${report.process_name}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(report);
    }

    if (!grouped.size) grouped.set("0:Tổng hợp", []);
    for (const [key, rows] of grouped) {
        const processName = key.split(":").slice(1).join(":");
        const sheet = workbook.addWorksheet(safeSheetName(processName));
        sheet.columns = [
            { header: "STT", key: "stt", width: 8 },
            { header: "Ngày", key: "work_date", width: 13 },
            { header: "Ca", key: "shift", width: 10 },
            { header: "Mã NV", key: "worker_code", width: 12 },
            { header: "Họ tên", key: "full_name", width: 24 },
            { header: "Máy", key: "machine_no", width: 15 },
            { header: "Sản phẩm", key: "product_name", width: 20 },
            { header: "Tổng giờ", key: "total_time", width: 12 },
            { header: "Giờ trừ", key: "deduction_time", width: 12 },
            { header: "Giờ thực tế", key: "actual_time", width: 13 },
            { header: "Định mức", key: "standard_output", width: 12 },
            { header: "Thực tế", key: "actual_output", width: 12 },
            { header: "OK", key: "tt_ok", width: 12 },
            { header: "NG", key: "tt_ng", width: 12 },
            { header: "Ghi chú", key: "note", width: 30 }
        ];
        sheet.getRow(1).font = { bold: true };
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        let currentDate = "";
        let stt = 0;
        for (const row of rows) {
            const date = String(row.work_date).slice(0, 10);
            if (date !== currentDate) { currentDate = date; stt = 0; }
            stt += 1;
            sheet.addRow({ ...row, stt, work_date: date }).commit();
        }
        sheet.commit();
    }
    await workbook.commit();
    await fs.rename(temporary, target);
    return { path: target, url: null };
};

module.exports = { buildMonthlyWorkbook };
