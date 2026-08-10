const { TtlCache } = require("../utils/cache");
const managerListCache = new TtlCache({ maxEntries: 300 });
const MANAGER_LIST_TTL_MS = 15000;
const ProductionTemp = require("../models/productionTempModel");
const { publicMessage } = require("../utils/httpError");
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
const { validateProductionReport } = require("../utils/reportValidation");

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
            search: req.query.search?.trim() || null
        };
        const cacheKey = `manager:pending:${req.user?.role}:${userId}:${JSON.stringify(filters)}`;
        let data = managerListCache.get(cacheKey);
        if (data === undefined) {
            data = await ProductionTemp.getPending(userId, filters, req.user?.role === "admin");
            managerListCache.set(cacheKey, data, MANAGER_LIST_TTL_MS);
        }
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET PENDING REPORTS ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Không thể lấy báo cáo chờ duyệt") });
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
            search: req.query.search?.trim() || null
        };
        const cacheKey = `manager:approved:${req.user?.role}:${userId}:${JSON.stringify(filters)}`;
        let data = managerListCache.get(cacheKey);
        if (data === undefined) {
            data = await ProductionTemp.getApproved(userId, filters, req.user?.role === "admin");
            managerListCache.set(cacheKey, data, MANAGER_LIST_TTL_MS);
        }
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET APPROVED REPORTS ERROR:", error);
        return res.status(500).json({ success: false, message: publicMessage(error, "Không thể lấy báo cáo đã duyệt") });
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
        const ids = targets.map((item) => item.id);
        const reviewerId = toPositiveInteger(req.user?.id);
        if (ids.length === 0) return res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất một báo cáo" });
        if (!reviewerId) return res.status(401).json({ success: false, message: "Thông tin người duyệt không hợp lệ" });

        const result = await ProductionTemp.approveSelected(targets, reviewerId, req.user?.role === "admin");

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
        console.error("APPROVE SELECTED REPORTS ERROR:", error);
        return res.status(error.status || 400).json({ success: false, message: publicMessage(error, "Không thể duyệt báo cáo") });
    }
};

exports.rejectSelectedReports = async (req, res) => {
    try {
        const targets = normalizeReviewTargets(req.body);
        const ids = targets.map((item) => item.id);
        const reviewerId = toPositiveInteger(req.user?.id);
        const reason = String(req.body?.reason || "").trim();

        if (ids.length === 0) return res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất một báo cáo" });
        if (!reviewerId) return res.status(401).json({ success: false, message: "Thông tin người xử lý không hợp lệ" });
        if (!reason) return res.status(400).json({ success: false, message: "Vui lòng nhập lý do từ chối" });

        const result = await ProductionTemp.rejectSelected(targets, reviewerId, reason, req.user?.role === "admin");
        return res.status(200).json({ success: true, message: "Đã từ chối báo cáo", data: result });
    } catch (error) {
        console.error("REJECT SELECTED REPORTS ERROR:", error);
        return res.status(error.status || 400).json({ success: false, message: publicMessage(error, "Không thể từ chối báo cáo") });
    }
};

exports.updateTempReport = async (req, res) => {
    try {
        const reportId = toPositiveInteger(req.params.id);
        const changedBy = toPositiveInteger(req.user?.id);
        if (!reportId) return res.status(400).json({ success: false, message: "ID báo cáo không hợp lệ" });

        const current = await ProductionTemp.getDetail(reportId);
        if (!current) return res.status(404).json({ success: false, message: "Không tìm thấy báo cáo" });
        const payload = { ...current, ...(req.body || {}), defects: req.body?.defects ?? current.defects, deductions: req.body?.deductions ?? current.deductions };

        if (req.user?.role === "worker") {
            const workDateError = validateWorkerWorkDate(payload.work_date);
            if (workDateError) {
                return res.status(422).json({ success: false, message: workDateError });
            }
        }

        const validation = validateProductionReport(payload, { enforceBackDate: false });
        if (!validation.valid) return res.status(422).json({ success: false, message: "Dữ liệu báo cáo không hợp lệ", errors: validation.errors });
        const operationType = String(req.body?.operation_type || payload?.operation_type || "").trim().toUpperCase() || null;
        const operationMode = String(req.body?.operation_mode || req.body?.execution_method || payload?.operation_mode || "").trim().toUpperCase() || null;
        const machinePolicy = getProcessMachinePolicy(current.process_id);
        const rawMachineLines = operationMode === "MANUAL"
            ? []
            : Array.isArray(req.body?.machine_lines)
                ? req.body.machine_lines
                : current.machine_lines || [];
        const normalizedMachineNo = String(validation.normalized.machine_no || payload?.machine_no || "").trim();

        if (machinePolicy.mode === "MANUAL_ONLY" && (operationMode === "MACHINE" || rawMachineLines.length || normalizedMachineNo)) {
            return res.status(422).json({ success: false, message: "Công đoạn này chỉ thực hiện bằng tay", errors: { machine_no: "Không được chọn máy" } });
        }
        if (machinePolicy.mode === "MULTI_MACHINE_REQUIRED" && rawMachineLines.length === 0) {
            return res.status(422).json({ success: false, message: "Công đoạn này bắt buộc nhập danh sách máy", errors: { machine_lines: "Vui lòng chọn từ 1 đến 4 máy" } });
        }
        if (machinePolicy.mode === "SINGLE_MACHINE_REQUIRED" && ((!normalizedMachineNo && rawMachineLines.length === 0) || rawMachineLines.length > 1)) {
            const label = machinePolicy.code === "DO" ? "Đo" : machinePolicy.code === "EP" ? "Ép" : "Cán";
            return res.status(422).json({ success: false, message: `Công đoạn ${label} yêu cầu đúng một máy`, errors: { machine_no: `Vui lòng chọn đúng một máy ${label.toLowerCase()}` } });
        }
        if (machinePolicy.mode === "MANUAL_OR_SINGLE_MACHINE" && rawMachineLines.length > 1) {
            return res.status(422).json({ success: false, message: "Công đoạn Kiểm chỉ được chọn tối đa một máy", errors: { machine_lines: "Chỉ được chọn một máy hoặc làm tay" } });
        }

        const machineValidation = await validateMachineLines({
            processId: current.process_id,
            machineLines: rawMachineLines,
            operationType,
            operationMode: operationMode || (rawMachineLines.length ? "MACHINE" : "MANUAL"),
            maxMachines: machinePolicy.maxMachines || 4
        });
        if (!machineValidation.valid) {
            return res.status(422).json({
                success: false,
                message: "Thông tin máy hoặc thời gian máy không hợp lệ",
                errors: machineValidation.errors
            });
        }
        const editFactoryRules = await validateFactoryMachineRules({
            processCode: machinePolicy.code,
            processId: current.process_id,
            machineLines: machineValidation.lines.length
                ? machineValidation.lines
                : (normalizedMachineNo ? [{ machine_code: normalizedMachineNo }] : [])
        });
        if (!editFactoryRules.valid) {
            return res.status(422).json({ success: false, message: "Cách sử dụng máy không đúng quy tắc thực tế tại xưởng", errors: editFactoryRules.errors });
        }
        const editCapacity = await validateMachineWorkerCapacity({
            processCode: machinePolicy.code,
            processId: current.process_id,
            machineLines: machineValidation.lines.length
                ? machineValidation.lines
                : (normalizedMachineNo ? [{ machine_code: normalizedMachineNo }] : []),
            workerId: current.worker_id,
            workDate: payload.work_date,
            shift: payload.shift,
            excludeTempReportId: reportId
        });
        if (!editCapacity.valid) {
            return res.status(422).json({ success: false, message: "Máy đã đủ số người cho phép trong ngày/ca", errors: editCapacity.errors });
        }

        const firstLine = machineValidation.lines[0] || null;
        const master = await validateMasterData({
            workerId: current.worker_id,
            processId: current.process_id,
            machineNo: firstLine?.machine_code || validation.normalized.machine_no,
            productName: firstLine?.product_code || validation.normalized.product_name,
            defects: validation.normalized.defects,
            deductions: validation.normalized.deductions,
            ttOk: operationMode === "MANUAL" ? validation.normalized.tt_ok : undefined,
            actualOutput: operationMode === "MANUAL" ? validation.normalized.actual_output : undefined,
            allowEmptyMachine: operationMode === "MANUAL" || machinePolicy.mode === "MANUAL_ONLY"
        });
        if (!master.valid) return res.status(422).json({ success: false, message: "Dữ liệu danh mục không hợp lệ", errors: master.errors });

        const hasMachineLines = machineValidation.lines.length > 0;
        const totalMachineHours = Number(machineValidation.totals?.totalMachineHours || 0);
        const normalizedUpdate = {
            ...validation.normalized,
            operation_mode: (hasMachineLines || (operationMode === "MACHINE" && master.machineCode)) ? "MACHINE" : "MANUAL",
            machine_no: hasMachineLines
                ? machineValidation.lines.map((line) => line.machine_code).join(", ")
                : (operationMode === "MACHINE" ? master.machineCode : null),
            product_name: hasMachineLines
                ? [...new Set(machineValidation.lines.map((line) => line.product_code))].join(", ")
                : master.productCode,
            standard_output: hasMachineLines
                ? (totalMachineHours > 0
                    ? Number(machineValidation.totals?.totalMaximum || 0) / totalMachineHours
                    : 0)
                : master.standardOutput,
            actual_output: hasMachineLines
                ? Number(machineValidation.totals?.totalCounted || 0)
                : validation.normalized.actual_output,
            tt_ok: hasMachineLines
                ? Number(machineValidation.totals?.totalOk || 0)
                : validation.normalized.tt_ok,
            tt_ng: hasMachineLines
                ? Number(machineValidation.totals?.totalNg || 0)
                : validation.normalized.tt_ng,
            exclude_kqd_from_tt: hasMachineLines ? 0 : master.excludeKqdFromTt,
            machine_lines: machineValidation.lines
        };

        const result = await ProductionTemp.updateReport(
            reportId,
            normalizedUpdate,
            changedBy,
            req.body?.reason || null,
            {
                isAdmin: req.user?.role === "admin",
                workerId: req.user?.role === "worker" ? req.user?.worker_id : null,
                expectedUpdatedAt: req.body?.expected_updated_at || null
            }
        );

        return res.status(200).json({
            success: true,
            message: result.changed ? "Cập nhật báo cáo thành công" : "Không có dữ liệu thay đổi",
            data: result
        });
    } catch (error) {
        console.error("UPDATE TEMP REPORT ERROR:", error);
        return res.status(error.status || 400).json({ success: false, message: publicMessage(error, "Không thể cập nhật báo cáo") });
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
