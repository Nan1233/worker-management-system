const SyncJob = require("../models/syncJobModel");
const SyncJobService = require("../services/syncJobService");

exports.process = async (req, res) => {
    try {
        const secret = process.env.SYNC_CRON_SECRET;
        if (secret && req.headers["x-cron-secret"] !== secret) {
            return res.status(403).json({ success: false, message: "Cron secret không hợp lệ" });
        }
        const data = await SyncJobService.processReadyJobs(Math.min(Number(req.body?.limit) || 5, 20));
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.list = async (_req, res) => {
    try { return res.json({ success: true, data: await SyncJob.list(100) }); }
    catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};
