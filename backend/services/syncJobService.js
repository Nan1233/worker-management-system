const SyncJob = require("../models/syncJobModel");
const GoogleSheetService = require("./googleSheetService");
const MonthlyExcelService = require("./monthlyExcelService");

const enqueueForApprovedDates = async (dates) => {
    for (const date of [...new Set(dates)]) {
        const value = String(date).slice(0, 10);
        await SyncJob.upsert({ jobType: "google_sheet", jobKey: value, workDate: value });
        await SyncJob.upsert({ jobType: "monthly_excel", jobKey: value.slice(0, 7), reportMonth: value.slice(0, 7) });
    }
};

const processReadyJobs = async (limit = 5) => {
    const jobs = await SyncJob.claimReady(limit);
    const result = [];
    for (const job of jobs) {
        try {
            let output;
            if (job.job_type === "google_sheet") output = await GoogleSheetService.syncProductionReport(job.work_date);
            else if (job.job_type === "monthly_excel") output = await MonthlyExcelService.buildMonthlyWorkbook(job.report_month);
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

let workerRunning = false;
let workerTimer = null;

const runWorkerOnce = async () => {
    if (workerRunning) return;
    workerRunning = true;
    try {
        await processReadyJobs(5);
    } catch (error) {
        console.error("SYNC JOB WORKER ERROR:", error);
    } finally {
        workerRunning = false;
    }
};

const startWorker = () => {
    if (workerTimer) return workerTimer;
    setImmediate(runWorkerOnce);
    workerTimer = setInterval(runWorkerOnce, Number(process.env.SYNC_JOB_INTERVAL_MS || 60000));
    workerTimer.unref();
    return workerTimer;
};

const triggerWorker = () => setImmediate(runWorkerOnce);

module.exports = { enqueueForApprovedDates, processReadyJobs, startWorker, triggerWorker };
