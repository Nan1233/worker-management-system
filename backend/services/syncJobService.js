const SyncJob = require("../models/syncJobModel");
const GoogleSheetService = require("./googleSheetService");
const MonthlyExcelService = require("./monthlyExcelService");

const enqueueForApprovedDates = async (dates) => {
    for (const date of [...new Set(dates)]) {
        const value = String(date).slice(0, 10);
        await SyncJob.upsert({ jobType: "google_sheet", jobKey: value, workDate: value });
        await SyncJob.upsert({ jobType: "monthly_excel", jobKey: value.slice(0, 7), yearMonth: value.slice(0, 7) });
    }
};

const processReadyJobs = async (limit = 5) => {
    const jobs = await SyncJob.claimReady(limit);
    const result = [];
    for (const job of jobs) {
        try {
            let output;
            if (job.job_type === "google_sheet") output = await GoogleSheetService.syncProductionReport(job.work_date);
            else if (job.job_type === "monthly_excel") output = await MonthlyExcelService.buildMonthlyWorkbook(job.year_month);
            else throw new Error(`Loại job không hỗ trợ: ${job.job_type}`);
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
