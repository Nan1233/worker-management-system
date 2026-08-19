const fs = require("fs/promises");
const { pipeline } = require("stream/promises");
const fsSync = require("fs");

const {
    buildMonthlyWorkbook,
    getMonthlyFile
} = require("./monthlyExcelService");

const normalizeDateOrMonth = (value) => {
    const raw = String(value || "").trim();

    if (/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(raw)) {
        return {
            selectedDate: raw,
            yearMonth: raw.slice(0, 7)
        };
    }

    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
        return {
            selectedDate: `${raw}-01`,
            yearMonth: raw
        };
    }

    const error = new Error("Ngày hoặc tháng xuất Excel không hợp lệ");
    error.statusCode = 400;
    throw error;
};

/**
 * Luôn dựng lại file từ DB trước khi trả về.
 * Đây là nguồn Excel dùng chung cho web, Android, iOS và desktop.
 */
const generateLatestMonthlyExcel = async (dateOrMonth) => {
    const { selectedDate, yearMonth } = normalizeDateOrMonth(dateOrMonth);
    const result = await buildMonthlyWorkbook(yearMonth);
    const target = getMonthlyFile(yearMonth);
    const stat = await fs.stat(result.path || target.filePath);

    return {
        selectedDate,
        yearMonth,
        filePath: result.path || target.filePath,
        fileName: result.fileName || target.fileName,
        reportCount: Number(result.reportCount) || 0,
        size: stat.size,
        generatedAt: new Date().toISOString()
    };
};

const getMonthlyExcelStatus = async (dateOrMonth) => {
    const { selectedDate, yearMonth } = normalizeDateOrMonth(dateOrMonth);
    const target = getMonthlyFile(yearMonth);

    try {
        const [stat, metadataText] = await Promise.all([
            fs.stat(target.filePath),
            fs.readFile(target.metadataPath, "utf8").catch(() => "{}")
        ]);

        let metadata = {};
        try {
            metadata = JSON.parse(metadataText);
        } catch {
            metadata = {};
        }

        return {
            selectedDate,
            yearMonth,
            ready: true,
            fileName: target.fileName,
            size: stat.size,
            reportCount: Number(metadata.reportCount) || 0,
            generatedAt: metadata.generatedAt || stat.mtime.toISOString(),
            latestUpdatedAt: metadata.latestUpdatedAt || null
        };
    } catch (error) {
        if (error?.code !== "ENOENT") throw error;

        return {
            selectedDate,
            yearMonth,
            ready: false,
            fileName: target.fileName,
            size: 0,
            reportCount: 0,
            generatedAt: null,
            latestUpdatedAt: null
        };
    }
};

const sendExcelFile = async (res, file) => {
    res.status(200);
    res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`
    );
    res.setHeader("Content-Length", String(file.size));
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    await pipeline(fsSync.createReadStream(file.filePath), res);
};

module.exports = {
    normalizeDateOrMonth,
    generateLatestMonthlyExcel,
    getMonthlyExcelStatus,
    sendExcelFile
};
