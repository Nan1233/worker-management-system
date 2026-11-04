const db = require("../config/db");
const { omitUnsentCollections, preserveStoredMachineData } = require("../utils/editPayload");
const { TtlCache } = require("../utils/cache");
const managerListCache = new TtlCache({ maxEntries: 300 });
const MANAGER_LIST_TTL_MS = 15000;

function invalidateManagerReportLists() {
    managerListCache.deleteByPrefix("manager:pending:");
    managerListCache.deleteByPrefix("manager:approved:");
}
const ProductionTemp = require("../models/productionTempModel");
const { publicMessage } = require("../utils/httpError");
const { updateTempReportUseCase } = require("../services/productionTempUpdateUseCase");
const { hasPermission } = require("../services/permissionService");
const { assertProcessesScope } = require("../services/processAuthorizationService");
const { validateMachineLines } = require("../services/machineLineValidationService");
const { validateFactoryMachineRules, validateMachineWorkerCapacity } = require("../services/factoryMachineRuleService");
const { getProcessMachinePolicy } = require("../services/processMachinePolicy");
const { envEnabled } = require("../utils/featureFlags");
const {
    toPositiveInteger,
    validateWorkerWorkDate,
    normalizeIds,
    normalizeReviewTargets,
    requestMeta,
} = require("./productionTempControllerUtils");
const { validateMasterData } = require("../services/reportBusinessValidationService");
const { gcWorkTypeFromOperationType, gcWorkTypeLabel } = require("../utils/gcMachineWorkType");
const { assertWorkerOwnership } = require("../services/processAuthorizationService");
const { validateProductionReport } = require("../utils/reportValidation");
const { calculateProductionOutput } = require("../../shared/productionOutput.cjs");
const {
    normalizePagination,
    normalizeSearch,
    assertReviewBatchSize
} = require("../services/managerReportPaginationService");

exports.getPendingReports = async (req, res) => {
    try {
        const userId = toPositiveInteger(req.user?.id);
        if (!userId) return res.status(401).json({ success: false, message: "Thông tin đăng nhập không hợp lệ" });

        const filters = {
            date: req.query.date || null,
            date_from: req.query.date_from || null,
            date_to: req.query.date_to || null,
            shift: req.query.shift || null,
            process_id: toPositiveInteger(req.query.process_id),
            process_name: req.query.process_name?.trim() || null,
            search: normalizeSearch(req.query.search),
            include_meta: req.query.include_meta !== "0",
            pagination: normalizePagination(req.query)
        };
        const cacheKey = `manager:pending:${req.user?.role}:${userId}:${JSON.stringify(filters)}`;
        let data = managerListCache.get(cacheKey);
        if (data === undefined) {
            data = await ProductionTemp.getPending(userId, filters, req.user?.role === "admin");
            managerListCache.set(cacheKey, data, MANAGER_LIST_TTL_MS);
        }
        return res.status(200).json({
            success: true,
            data: data.items,
            pagination: data.pagination,
            processes: data.processes,
            previous_count: data.previous_count
        });
    } catch (error) {
        console.error("GET PENDING REPORTS ERROR:", error);
        return res.status(error.status || 500).json({ success: false, code: error.code || undefined, message: publicMessage(error, "Không thể lấy báo cáo chờ duyệt") });
    }
};

exports.getApprovedReports = async (req, res) => {
    try {
        const userId = toPositiveInteger(req.user?.id);
        if (!userId) return res.status(401).json({ success: false, message: "Thông tin đăng nhập không hợp lệ" });

        const filters = {
            date: req.query.date || null,
            date_from: req.query.date_from || null,
            date_to: req.query.date_to || null,
            shift: req.query.shift || null,
            process_id: toPositiveInteger(req.query.process_id),
            process_name: req.query.process_name?.trim() || null,
            search: normalizeSearch(req.query.search),
            pagination: normalizePagination(req.query)
        };
        const cacheKey = `manager:approved:${req.user?.role}:${userId}:${JSON.stringify(filters)}`;
        let data = managerListCache.get(cacheKey);
        if (data === undefined) {
            data = await ProductionTemp.getApproved(userId, filters, req.user?.role === "admin");
            managerListCache.set(cacheKey, data, MANAGER_LIST_TTL_MS);
        }
        return res.status(200).json({
            success: true,
            data: data.items,
            pagination: data.pagination,
            processes: data.processes
        });
    } catch (error) {
        console.error("GET APPROVED REPORTS ERROR:", error);
        return res.status(error.status || 500).json({ success: false, code: error.code || undefined, message: publicMessage(error, "Không thể lấy báo cáo đã duyệt") });
    }
};

exports.getTempDates = async (req, res) => {
    try {
        const userId = toPositiveInteger(req.user?.id);
        const data = await ProductionTemp.getDates(req.user?.role === "admin" ? null : userId);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET TEMP DATES ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Không thể lấy danh sách ngày") });
    }
};

exports.getTempReportsByDate = async (req, res) => {
    try {
        if (!req.query.date) return res.status(400).json({ success: false, message: "Thiếu ngày cần xem" });
        const data = await ProductionTemp.getByDate(req.query.date, req.user?.role === "admin" ? null : toPositiveInteger(req.user?.id));
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET TEMP REPORTS BY DATE ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Không thể lấy báo cáo theo ngày") });
    }
};

exports.getTempReportDetail = async (req, res) => {
    try {
        const reportId = toPositiveInteger(req.params.id);
        if (!reportId) return res.status(400).json({ success: false, message: "ID báo cáo không hợp lệ" });

        const data = await ProductionTemp.getDetail(reportId);
        if (!data) return res.status(404).json({ success: false, message: "Không tìm thấy báo cáo" });

        if (req.user?.role === "worker" && Number(data.worker_id) !== Number(req.user?.worker_id)) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền xem báo cáo này" });
        }

        if (req.user?.role !== "worker") {
            const canManage = await ProductionTemp.canManageReport(reportId, req.user.id, req.user?.role === "admin");
            if (!canManage && req.user?.role !== "admin") {
                return res.status(403).json({ success: false, message: "Báo cáo ngoài phạm vi phụ trách" });
            }
        }

        await ProductionTemp.logAction({
            reportType: "temp",
            reportId,
            userId: req.user.id,
            action: "VIEW",
            note: "Xem chi tiết báo cáo",
            ...requestMeta(req)
        });

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET TEMP REPORT DETAIL ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Không thể lấy chi tiết báo cáo") });
    }
};

exports.approveSelectedReports = async (req, res) => {
    try {
        const targets = normalizeReviewTargets(req.body);
        assertReviewBatchSize(targets);
        const ids = targets.map((item) => item.id);
        if (ids.length === 0) return res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất một báo cáo" });
        const reviewerId = toPositiveInteger(req.user?.id);
        if (!(await hasPermission(req.user, "REPORT_APPROVE"))) {
            return res.status(403).json({ success:false, code:"PERMISSION_DENIED", message:"Bạn không có quyền duyệt hoặc từ chối báo cáo" });
        }
        const [scopeRows] = await db.promise().query(
            `SELECT DISTINCT process_id FROM production_reports_temp WHERE id IN (${ids.map(() => "?").join(",")})`,
            ids
        );
        await assertProcessesScope(req.user, scopeRows.map((row) => row.process_id), { action:"REPORT_APPROVE" });
        if (!reviewerId) return res.status(401).json({ success: false, message: "Thông tin người duyệt không hợp lệ" });

        const result = await ProductionTemp.approveSelected(targets, reviewerId, req.user?.role === "admin");
        invalidateManagerReportLists();

        // Desktop owns workbook generation. Do not enqueue server-side Excel jobs
        // unless a legacy feature has been explicitly enabled.
        const googleSyncEnabled = envEnabled('ENABLE_GOOGLE_SHEET_SYNC');
        const serverExcelEnabled = envEnabled('ENABLE_SERVER_HEAVY_EXCEL') && envEnabled('ENABLE_EXCEL_EXPORT_WORKER');
        let syncQueued = false;

        if (googleSyncEnabled || serverExcelEnabled) {
            try {
                const SyncJobService = require('../services/syncJobService');
                await SyncJobService.enqueueForApprovedDates(result.dates);
                syncQueued = true;

                if (envEnabled('INLINE_SYNC_TRIGGER')) {
                    setImmediate(() => {
                        SyncJobService.processReadyJobs(1).catch((inlineError) => {
                            console.error('INLINE SYNC PROCESS ERROR:', inlineError);
                        });
                    });
                }
            } catch (queueError) {
                console.error('CREATE SYNC JOB ERROR:', queueError);
            }
        }

        return res.status(200).json({
            success: true,
            warning: false,
            message: syncQueued
                ? 'Duyệt thành công; tác vụ đồng bộ tùy chọn đã được xếp hàng'
                : 'Duyệt thành công; Excel sẽ được cập nhật từ ứng dụng Desktop',
            sync_queued: syncQueued,
            data: result
        });
    } catch (error) {
        // requestId ties this line to the http access log and to the X-Request-Id the browser saw; errno/sqlState
        // identify masked database failures (the client only gets a generic message in production).
        console.error(`APPROVE SELECTED REPORTS ERROR: requestId=${req.requestId || ""} status=${error.status || 400} code=${error.code || ""} errno=${error.errno || ""} sqlState=${error.sqlState || ""}`, error);
        if (error?.isSubrequestLimit || /too many subrequests/i.test(String(error?.message || ""))) {
            // Platform limit of the Worker invocation, not a business or data error: nothing was approved
            // (the transaction could not finish), so say so and let the user retry instead of a misleading 400.
            return res.status(503).json({
                success: false,
                code: "WORKER_SUBREQUEST_LIMIT",
                message: "Hệ thống đang quá tải khi xử lý báo cáo này. Chưa có báo cáo nào được duyệt, vui lòng thử lại; nếu lỗi lặp lại hãy báo quản trị viên.",
                requestId: req.requestId || undefined,
            });
        }
        return res.status(error.status || 400).json({ success: false, code: error.code || undefined, message: publicMessage(error, "Không thể duyệt báo cáo"), requestId: req.requestId || undefined });
    }
};

exports.rejectSelectedReports = async (req, res) => {
    try {
        const targets = normalizeReviewTargets(req.body);
        assertReviewBatchSize(targets);
        const ids = targets.map((item) => item.id);
        const reviewerId = toPositiveInteger(req.user?.id);
        const reason = String(req.body?.reason || "").trim();
        if (!(await hasPermission(req.user, "REPORT_APPROVE"))) {
            return res.status(403).json({ success:false, code:"PERMISSION_DENIED", message:"Bạn không có quyền duyệt hoặc từ chối báo cáo" });
        }
        const [scopeRows] = await db.promise().query(
            `SELECT DISTINCT process_id FROM production_reports_temp WHERE id IN (${ids.map(() => "?").join(",")})`,
            ids
        );
        await assertProcessesScope(req.user, scopeRows.map((row) => row.process_id), { action:"REPORT_REJECT" });

        if (ids.length === 0) return res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất một báo cáo" });
        if (!reviewerId) return res.status(401).json({ success: false, message: "Thông tin người xử lý không hợp lệ" });
        if (!reason) return res.status(400).json({ success: false, message: "Vui lòng nhập lý do từ chối" });

        const result = await ProductionTemp.rejectSelected(targets, reviewerId, reason, req.user?.role === "admin");
        invalidateManagerReportLists();
        return res.status(200).json({ success: true, message: "Đã từ chối báo cáo", data: result });
    } catch (error) {
        console.error(`REJECT SELECTED REPORTS ERROR: requestId=${req.requestId || ""} status=${error.status || 400} code=${error.code || ""} errno=${error.errno || ""}`, error);
        return res.status(error.status || 400).json({ success: false, code: error.code || undefined, message: publicMessage(error, "Không thể từ chối báo cáo"), requestId: req.requestId || undefined });
    }
};

exports.updateTempReport = async (req, res) => {
    const result = await updateTempReportUseCase({
        reportId: req.params?.id,
        body: req.body,
        user: req.user
    });
    return res.status(result.status).json(result.body);
};

exports.deleteTempReport = async (req, res) => {
    try {
        const reportId = Number(req.params.id);
        if (!Number.isInteger(reportId) || reportId <= 0) {
            return res.status(400).json({ success: false, message: "ID báo cáo không hợp lệ" });
        }

        const reason = String(req.body?.reason || "").trim();
        if (!reason) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập lý do xóa báo cáo" });
        }

        const result = await ProductionTemp.deleteTempReport(
            reportId,
            Number(req.user.id),
            req.user.role === "admin",
            reason,
            requestMeta(req)
        );
        invalidateManagerReportLists();
        return res.json({ success: true, message: "Đã xóa báo cáo", data: result });
    } catch (error) {
        console.error("DELETE TEMP REPORT ERROR:", error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Không thể xóa báo cáo"
        });
    }
};

exports.getReportActionLogs = async (req, res) => {
    try {
        const reportId = toPositiveInteger(req.params.id);
        if (!reportId) return res.status(400).json({ success: false, message: "ID báo cáo không hợp lệ" });

        const report = await ProductionTemp.getDetail(reportId);
        if (!report) return res.status(404).json({ success: false, message: "Không tìm thấy báo cáo" });

        if (req.user?.role === "worker" && Number(report.worker_id) !== Number(req.user?.worker_id)) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền xem lịch sử báo cáo này" });
        }

        if (req.user?.role !== "worker" && req.user?.role !== "admin") {
            const canManage = await ProductionTemp.canManageReport(reportId, req.user.id, req.user?.role === "admin");
            if (!canManage) return res.status(403).json({ success: false, message: "Báo cáo ngoài phạm vi phụ trách" });
        }

        const data = await ProductionTemp.getActionLogs(reportId, "temp");
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET REPORT ACTION LOGS ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Không thể lấy lịch sử thao tác") });
    }
};
