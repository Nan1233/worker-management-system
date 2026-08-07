const SyncJob = require("../models/syncJobModel");
const SyncJobService = require("../services/syncJobService");

exports.process = async (req, res) => {
    try {
        const secret = process.env.SYNC_CRON_SECRET;
        if (process.env.NODE_ENV === "production" && !secret) {
            return res.status(503).json({ success: false, message: "SYNC_CRON_SECRET chưa được cấu hình" });
        }
        if (!secret || req.headers["x-cron-secret"] !== secret) {
            return res.status(403).json({ success: false, message: "Cron secret không hợp lệ" });
        }
        const data = await SyncJobService.processReadyJobs(Math.min(Number(req.body?.limit) || 5, 20));
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "Không thể xử lý hàng đợi" : error.message });
    }
};

exports.list = async (_req, res) => {
    try { return res.json({ success: true, data: await SyncJob.list(100) }); }
    catch (error) { return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "Không thể xử lý hàng đợi" : error.message }); }
};

exports.health = async (_req, res) => {
    try {
        const diagnostics = await SyncJob.getDiagnostics();
        return res.json({
            success: true,
            data: {
                database_queue_ready: true,
                google_service_account_configured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT),
                google_spreadsheet_id_configured: Boolean(process.env.GOOGLE_SPREADSHEET_ID),
                worker_mode: process.env.RENDER_SERVICE_TYPE || null,
                inline_sync_trigger: String(process.env.INLINE_SYNC_TRIGGER || "true").toLowerCase() !== "false",
                queue: diagnostics
            }
        });
    } catch (error) {
        console.error("SYNC HEALTH ERROR:", error);
        return res.status(500).json({ success: false, message: "Không thể kiểm tra trạng thái đồng bộ" });
    }
};
