const SyncJob = require("../models/syncJobModel");

const isGoogleSheetSyncEnabled = () =>
    String(process.env.ENABLE_GOOGLE_SHEET_SYNC || "")
        .trim()
        .toLowerCase() === "true";

const isServerHeavyExcelEnabled = () =>
    String(process.env.ENABLE_SERVER_HEAVY_EXCEL || "")
        .trim()
        .toLowerCase() === "true";

const enqueueForApprovedDates = async (dates) => {
    for (const date of [...new Set(dates)]) {
        const value = String(date).slice(0, 10);
        if (isGoogleSheetSyncEnabled()) {
            await SyncJob.upsert({ jobType: "google_sheet", jobKey: value, workDate: value });
        }

        // Excel lớn được Desktop tạo. Chỉ xếp job trên server khi đã bật rõ ràng.
        if (isServerHeavyExcelEnabled()) {
            await SyncJob.upsert({
                jobType: "monthly_excel",
                jobKey: value.slice(0, 7),
                reportMonth: value.slice(0, 7)
            });
        }
    }
};

const processReadyJobs = async (limit = 5) => {
    const jobs = await SyncJob.claimReady(limit);
    const result = [];
    for (const job of jobs) {
        try {
            let output;
            if (job.job_type === "google_sheet") {
                output = isGoogleSheetSyncEnabled()
                    ? await require("./googleSheetService").syncProductionReport(job.work_date)
                    : { skipped: true, reason: "google_sheet_sync_disabled" };
            } else if (job.job_type === "monthly_excel") {
                // Dọn an toàn các job Excel cũ còn tồn tại sau deploy.
                output = isServerHeavyExcelEnabled()
                    ? await require("./monthlyExcelService").buildMonthlyWorkbook(job.report_month)
                    : { skipped: true, reason: "desktop_excel_required" };
            } else {
                throw new Error(`Loại job không hỗ trợ: ${job.job_type}`);
            }
            await SyncJob.markSuccess(job.id, output?.url || null);
            result.push({ id: job.id, success: true });
        } catch (error) {
            await SyncJob.markFailed(job.id, job.attempts, error);
            result.push({ id: job.id, success: false, error: error.message });
        }
    }
    return result;
};

module.exports = { enqueueForApprovedDates, processReadyJobs };
