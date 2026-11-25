'use strict';
const db = require('../config/db');
const ProductionTemp = require('../models/productionTempModel');
const { publicError } = require('../utils/httpError');
const { toPositiveInteger } = require('../utils/positiveInteger');
const { hasPermission } = require('./permissionService');
const { assertProcessesScope } = require('./processAuthorizationService');
const { assertReviewBatchSize } = require('./managerReportPaginationService');
const { invalidateManagerReportLists } = require('./managerReportListCacheService');
const { envEnabled } = require('../utils/featureFlags');
const { findPendingProcessIds } = require('../repositories/pendingReportScopeRepository');

async function authorizeReview({actor, targets, action}) {
    assertReviewBatchSize(targets);
    const ids = targets.map(item => item.id);
    if (!ids.length) throw publicError("Vui lòng chọn ít nhất một báo cáo",400);
    const reviewerId = toPositiveInteger(actor?.id);
    if (!(await hasPermission(actor,"REPORT_APPROVE"))) throw publicError("Bạn không có quyền duyệt hoặc từ chối báo cáo",403,"PERMISSION_DENIED");
    await assertProcessesScope(actor,await findPendingProcessIds(db.promise(),ids),{action});
    if (!reviewerId) throw publicError(action === "REPORT_APPROVE" ? "Thông tin người duyệt không hợp lệ" : "Thông tin người xử lý không hợp lệ",401);
    return reviewerId;
}

async function approveReports({actor,targets}) {
    const reviewerId = await authorizeReview({actor,targets,action:"REPORT_APPROVE"});
    const result = await ProductionTemp.approveSelected(targets,reviewerId,actor?.role === "admin");
    invalidateManagerReportLists();
        // Desktop owns workbook generation. Do not enqueue server-side Excel jobs
        // unless a legacy feature has been explicitly enabled.
        const googleSyncEnabled = envEnabled('ENABLE_GOOGLE_SHEET_SYNC');
        const serverExcelEnabled = envEnabled('ENABLE_SERVER_HEAVY_EXCEL') && envEnabled('ENABLE_EXCEL_EXPORT_WORKER');
        let syncQueued = false;

        if (googleSyncEnabled || serverExcelEnabled) {
            try {
                const SyncJobService = require('./syncJobService');
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


    return {result,syncQueued};
}

async function rejectReports({actor,targets,reason}) {
    const reviewerId = await authorizeReview({actor,targets,action:"REPORT_REJECT"});
    if (!reason) throw publicError("Vui lòng nhập lý do từ chối",400);
    const result = await ProductionTemp.rejectSelected(targets,reviewerId,reason,actor?.role === "admin");
    invalidateManagerReportLists();
    return result;
}
module.exports = { approveReports, rejectReports };
