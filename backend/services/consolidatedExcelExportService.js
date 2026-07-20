const ExcelJS = require("exceljs");
const fs = require("fs/promises");
const path = require("path");

const TEMPLATE_PATH = path.join(__dirname, "../templates/bao-cao-cat-long-export.xlsx");
const SHEET_NAME = "Cắt lồng";
const HEADER_ROW = 326;
const DATA_START_ROW = 327;
const COLUMN_COUNT = 53; // A:BA - giống Google Sheet

const normalizeText = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const toNumber = (value) => {
    const parsed = Number(String(value ?? 0).replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeDateKey = (value) => {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.slice(0, 10);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const toExcelDate = (value) => {
    const key = normalizeDateKey(value);
    if (!key) return null;
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
};

const formatDisplayDate = (value) => {
    const key = normalizeDateKey(value);
    if (!key) return "";
    const [year, month, day] = key.split("-");
    return `${day}/${month}/${year}`;
};

const sumMatching = (items, aliases, valueKey, codeKey, nameKey) => {
    const normalizedAliases = aliases.map(normalizeText);
    return (items || [])
        .filter((item) => {
            const code = normalizeText(item[codeKey]);
            const name = normalizeText(item[nameKey]);
            return normalizedAliases.some(
                (alias) => alias === code || alias === name || name.includes(alias)
            );
        })
        .reduce((total, item) => total + toNumber(item[valueKey]), 0);
};

const deduction = (report, aliases) => sumMatching(
    report.deductions,
    aliases,
    "hours",
    "deduction_code",
    "deduction_name"
);

const defect = (report, aliases) => sumMatching(
    report.defects,
    aliases,
    "quantity",
    "defect_code",
    "defect_name"
);

const sortReports = (first, second) => {
    const byDate = normalizeDateKey(first.work_date)
        .localeCompare(normalizeDateKey(second.work_date));
    if (byDate) return byDate;

    const byWorker = String(first.worker_code || "").localeCompare(
        String(second.worker_code || ""),
        undefined,
        { numeric: true, sensitivity: "base" }
    );
    if (byWorker) return byWorker;

    return Number(first.id) - Number(second.id);
};

const clone = (value) => {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
};

const captureTemplateRow = (sheet) => {
    const row = sheet.getRow(DATA_START_ROW);
    return {
        height: row.height,
        hidden: row.hidden,
        outlineLevel: row.outlineLevel,
        cells: Array.from({ length: COLUMN_COUNT }, (_, index) => {
            const cell = row.getCell(index + 1);
            return {
                style: clone(cell.style),
                numFmt: cell.numFmt,
                alignment: clone(cell.alignment),
                border: clone(cell.border),
                fill: clone(cell.fill),
                font: clone(cell.font),
                protection: clone(cell.protection)
            };
        })
    };
};

const applyTemplateRow = (sheet, rowNumber, templateRow) => {
    const row = sheet.getRow(rowNumber);
    row.height = templateRow.height;
    row.hidden = templateRow.hidden;
    row.outlineLevel = templateRow.outlineLevel;

    templateRow.cells.forEach((source, index) => {
        const cell = row.getCell(index + 1);
        if (source.style) cell.style = clone(source.style);
        if (source.numFmt) cell.numFmt = source.numFmt;
        if (source.alignment) cell.alignment = clone(source.alignment);
        if (source.border) cell.border = clone(source.border);
        if (source.fill) cell.fill = clone(source.fill);
        if (source.font) cell.font = clone(source.font);
        if (source.protection) cell.protection = clone(source.protection);
    });
};

const buildReportValues = (report, sequenceNumber, rowNumber) => {
    const values = Array(COLUMN_COUNT).fill("");
    const ok = toNumber(report.tt_ok);
    const ng = toNumber(report.tt_ng);

    values[0] = sequenceNumber;
    values[1] = report.worker_code || "";
    values[2] = report.full_name || "";
    values[3] = report.machine_no || "";
    values[4] = report.shift || "";
    values[5] = toNumber(report.training_percent || 100) / 100;
    values[6] = toNumber(report.total_time);
    values[7] = toNumber(report.actual_time);
    values[8] = "";
    values[9] = toNumber(report.deduction_time);
    values[10] = deduction(report, ["THIEU_SP", "Thiếu sản lượng"]);
    values[11] = deduction(report, ["BAT_MAY", "Bật máy, xét máy"]);
    values[12] = deduction(report, ["CHUYEN_MA", "Chuyển mã"]);
    values[13] = deduction(report, ["CHINH_MAY", "Chỉnh máy"]);
    values[14] = deduction(report, ["CHO_CHINH_MAY", "Chờ chỉnh máy"]);
    values[15] = deduction(report, ["MAT_DIEN", "Mất điện"]);
    values[16] = deduction(report, ["MAT_KHI", "Mất khí"]);
    values[17] = deduction(report, ["CHO_HANG", "Chờ hàng"]);
    values[18] = deduction(report, ["BAO_DUONG", "Bảo dưỡng máy"]);
    values[19] = deduction(report, ["NGHI_GIAI_LAO", "Nghỉ giải lao"]);
    values[20] = deduction(report, ["GIAO_CA", "Giao ca"]);
    values[21] = deduction(report, ["HO_TRO", "Dừng máy đi hỗ trợ"]);
    values[22] = deduction(report, ["GIAT_CAN", "Giặt cs/cân cs, tuốt-tái pp, GL"]);
    values[23] = deduction(report, ["5S"]);
    values[24] = deduction(report, ["HOC_VIEC", "Học việc, đào tạo"]);
    values[25] = "";
    values[26] = report.product_name || "";
    values[27] = toNumber(report.standard_output);
    values[28] = { formula: `AG${rowNumber}+AH${rowNumber}` };
    values[29] = { formula: `IFERROR(AC${rowNumber}/AB${rowNumber},0)` };
    values[30] = toExcelDate(report.work_date);
    values[31] = { formula: `IFERROR(AC${rowNumber}/H${rowNumber},0)` };
    values[32] = ok;
    values[33] = ng;
    values[34] = { formula: `IFERROR(AH${rowNumber}/AC${rowNumber},0)` };
    values[35] = "";
    values[36] = defect(report, ["KQD_DAP_LAI", "KQĐ dập lại", "Dập lại"]);
    values[37] = defect(report, ["KQD_TUOT", "KQĐ tuột", "Tuột"]);
    values[38] = defect(report, ["VO_DO_LONG", "VO_LONG", "Vỡ do lồng"]);
    values[39] = defect(report, ["XUOC_DO_LONG", "XUOC_LONG", "Xước do lồng"]);
    values[40] = defect(report, ["CONG_GAY", "Cong gãy"]);
    values[41] = defect(report, ["XOAY", "Xoay"]);
    values[42] = defect(report, ["KHONG_DUT", "Không đứt"]);
    values[43] = defect(report, ["BAVIA_HUT", "BAVIA", "Bavia hụt"]);
    values[44] = defect(report, ["PPCM"]);
    values[45] = defect(report, ["LOI_CAO_SU", "CAO_SU", "Lỗi cao su"]);
    values[46] = defect(report, ["NG_KICH_THUOC", "KT", "NG kích thước"]);
    values[47] = defect(report, ["CAT_LEM", "Cắt lẹm"]);
    values[48] = defect(report, ["CHAN_NGAN_DAI", "CHAN_NGAN", "Chặn ngắn dài"]);
    values[49] = defect(report, ["SOT_VIA", "SOT_BAVIA", "Sót via"]);
    values[50] = defect(report, ["FURE_TRUC", "FURE", "Fure trục"]);
    values[51] = report.status || "approved";
    values[52] = report.note || "";

    return values;
};

const writeDateRow = (sheet, rowNumber, date, templateRow) => {
    applyTemplateRow(sheet, rowNumber, templateRow);
    const row = sheet.getRow(rowNumber);
    for (let column = 1; column <= COLUMN_COUNT; column += 1) {
        row.getCell(column).value = null;
    }
    const cell = row.getCell("A");
    cell.value = formatDisplayDate(date);
    cell.numFmt = "@";
    cell.font = { ...(cell.font || {}), bold: true };
};

const writeReportRow = (sheet, rowNumber, report, sequenceNumber, templateRow) => {
    applyTemplateRow(sheet, rowNumber, templateRow);
    const row = sheet.getRow(rowNumber);
    const values = buildReportValues(report, sequenceNumber, rowNumber);

    values.forEach((value, index) => {
        row.getCell(index + 1).value = value;
    });

    row.getCell("A").numFmt = "0";
    row.getCell("F").numFmt = "0.00%";
    row.getCell("AD").numFmt = "0.00%";
    row.getCell("AE").numFmt = "dd/mm/yyyy";
    row.getCell("AI").numFmt = "0.00%";
};

const safeFolderName = (value, fallback) => String(value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim() || fallback;

const getMonthlyTarget = (yearMonth) => {
    const [year, month] = yearMonth.split("-");
    const root = process.env.EXCEL_EXPORT_ROOT || path.join(process.cwd(), "exports");
    const stageName = safeFolderName(
        process.env.EXCEL_STAGE_FOLDER_NAME || "Cắt lồng",
        "Cắt lồng"
    );
    const folder = path.join(root, year, stageName);
    const fileName = `Bao-cao-san-xuat-${month}-${year}.xlsx`;
    const filePath = path.join(folder, fileName);
    return {
        folder,
        fileName,
        filePath,
        metadataPath: `${filePath}.meta.json`
    };
};

const readMonthlyCacheMetadata = async (yearMonth) => {
    const target = getMonthlyTarget(yearMonth);
    try {
        const [fileStat, metadataText] = await Promise.all([
            fs.stat(target.filePath),
            fs.readFile(target.metadataPath, "utf8")
        ]);
        const metadata = JSON.parse(metadataText);
        return { target, fileStat, metadata };
    } catch (error) {
        if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
        throw error;
    }
};

const writeMonthlyCacheMetadata = async (target, metadata) => {
    const temporaryPath = `${target.metadataPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(metadata), "utf8");
    await fs.rename(temporaryPath, target.metadataPath);
};

const buildMonthlyTemplateWorkbook = async (reports, yearMonth, cacheMetadata = {}) => {
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
        throw new Error("Tháng xuất Excel không hợp lệ");
    }

    await fs.access(TEMPLATE_PATH);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE_PATH);

    const sheet = workbook.getWorksheet(SHEET_NAME);
    if (!sheet) {
        throw new Error(`Không tìm thấy sheet ${SHEET_NAME} trong file mẫu`);
    }

    const templateRow = captureTemplateRow(sheet);

    // Excel mẫu có các shared formula trong vùng dữ liệu cũ. Nếu spliceRows trực tiếp,
    // ExcelJS có thể giữ clone nhưng xóa master và lỗi khi ghi file. Phải xóa giá trị/
    // công thức trước, sau đó mới bỏ các dòng cũ.
    if (sheet.rowCount >= DATA_START_ROW) {
        const lastRow = sheet.rowCount;
        for (let rowIndex = DATA_START_ROW; rowIndex <= lastRow; rowIndex += 1) {
            const row = sheet.getRow(rowIndex);
            for (let columnIndex = 1; columnIndex <= sheet.columnCount; columnIndex += 1) {
                row.getCell(columnIndex).value = null;
            }
        }
        sheet.spliceRows(DATA_START_ROW, lastRow - HEADER_ROW);
    }

    const sortedReports = [...reports].sort(sortReports);
    let rowNumber = DATA_START_ROW;
    let currentDate = "";
    let sequenceNumber = 0;

    for (const report of sortedReports) {
        const dateKey = normalizeDateKey(report.work_date);
        if (dateKey !== currentDate) {
            currentDate = dateKey;
            sequenceNumber = 0;
            writeDateRow(sheet, rowNumber, report.work_date, templateRow);
            rowNumber += 1;
        }

        sequenceNumber += 1;
        writeReportRow(sheet, rowNumber, report, sequenceNumber, templateRow);
        rowNumber += 1;
    }

    workbook.calcProperties.fullCalcOnLoad = true;
    workbook.calcProperties.forceFullCalc = true;

    const target = getMonthlyTarget(yearMonth);
    await fs.mkdir(target.folder, { recursive: true });

    const temporaryPath = `${target.filePath}.${process.pid}.${Date.now()}.tmp`;
    await workbook.xlsx.writeFile(temporaryPath);
    await fs.rename(temporaryPath, target.filePath);
    await writeMonthlyCacheMetadata(target, {
        yearMonth,
        reportCount: sortedReports.length,
        latestUpdatedAt: cacheMetadata.latestUpdatedAt || null,
        generatedAt: new Date().toISOString()
    });

    return {
        workbook,
        archivePath: target.filePath,
        fileName: target.fileName,
        reportCount: sortedReports.length
    };
};

module.exports = {
    buildMonthlyTemplateWorkbook,
    getMonthlyTarget,
    readMonthlyCacheMetadata,
    TEMPLATE_PATH,
    SHEET_NAME,
    DATA_START_ROW
};
