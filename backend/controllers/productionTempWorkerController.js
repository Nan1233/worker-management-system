const {submitWorkerReport}=require('../services/workerReportSubmissionService');
const {checkSimilarReport}=require('../services/workerSimilarReportService');
const ProductionTemp = require("../models/productionTempModel");
const { publicMessage } = require("../utils/httpError");
const {
    toPositiveInteger,
    requestMeta,
} = require("./productionTempControllerUtils");

exports.checkSimilarReport = async (req, res) => {
    try {
        const {status,payload}=await checkSimilarReport({actor:req.user,body:req.body});
        return res.status(status).json(payload);
    } catch (error) {
        // Structured, non-sensitive diagnostics: which step failed and with which
        // business code. No tokens, no worker identity, no request body dump.
        try {
            console.error("CHECK SIMILAR REPORT ERROR:", JSON.stringify({
                event: "check_similar_failed",
                requestId: req.headers?.["x-request-id"] || null,
                rayId: req.headers?.["cf-ray"] || null,
                processId: toPositiveInteger(req.body?.process_id) || null,
                machineNo: String(req.body?.machine_no || "").trim().slice(0, 40) || null,
                productName: String(req.body?.product_name || "").trim().slice(0, 80) || null,
                status: error.status || 500,
                code: error.code || null,
                businessError: Boolean(error.isPublic),
                sqlCode: /^ER_/.test(String(error.code || "")) ? String(error.code) : (error.sqlState ? String(error.sqlState) : null),
                message: String(error.message || "").slice(0, 300),
                // Business-error details are ids/codes only (process, product, work types); never request bodies.
                details: error.isPublic && error.details && typeof error.details === "object" ? JSON.stringify(error.details).slice(0, 500) : null,
                failedAt: String(error.stack || "").split("\n").slice(1, 4).map((line) => line.trim().replace(/\(.*[\\/]/, "(")),
            }));
        } catch (_logError) { /* logging must never change the business response */ }
        return res.status(error.status || 500).json({ success: false, code: error.code || undefined, message: publicMessage(error, "Không thể kiểm tra báo cáo trùng") });
    }
};

exports.createTempReport = async (req,res) => {
    const {status,payload}=await submitWorkerReport({actor:req.user,body:req.body,auditMeta:requestMeta(req)});
    return res.status(status).json(payload);
};

exports.getMyTempReports = async (req, res) => {
    try {
        const workerId = toPositiveInteger(req.user?.worker_id);
        if (!workerId) {
            return res.status(400).json({ success: false, message: "Tài khoản chưa có thông tin nhân viên" });
        }
        const data = await ProductionTemp.getHistoryByWorker(workerId);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET MY TEMP REPORTS ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Lỗi lấy lịch sử báo cáo") });
    }
};

