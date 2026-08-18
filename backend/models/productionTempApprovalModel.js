const AuditService = require("../services/auditService");
const { query, getConnection, beginTransaction, commit, rollback, normalizeIds, editableFields } = require("./productionTempModelShared");
const { createStandardResolver, assertStandardSnapshotConsistency } = require("../services/standardResolutionService");
const { assertKqdPolicySnapshotConsistency } = require("../services/kqdPolicySnapshotService");
const { assertApprovedEventForTempLine } = require("../services/machineProductionEventService");
const { buildApprovalPayload, serializeExtraData, assertApprovedReportIdentity } = require("../services/productionApprovalService");
const { createApprovedReportVersion } = require("../services/approvedVersionSnapshotService");
const { createApprovedSnapshot } = require("../services/approvedReportSnapshotService");
const { loadApprovedSnapshot } = require("../services/approvedReportEditService");
const runtimeMetrics = require("../services/runtimeMetrics");

function assertReviewBatchSize(ids) { if (!Array.isArray(ids) || ids.length === 0) throw new Error("Danh sách báo cáo không hợp lệ"); if (ids.length > 100) throw new Error("Chỉ được duyệt tối đa 100 báo cáo mỗi lần"); }
function datesForExcel(rows) { return [...new Set(rows.map((row) => String(row.work_date || "").slice(0, 10)).filter(Boolean))]; }

module.exports = {
  async approveSelected(targets, reviewerId, options = {}) {
    assertReviewBatchSize(targets);
    const normalizedTargets = Array.isArray(targets) ? targets.map((item) => typeof item === "object" ? item : { id: item, expected_updated_at: null }) : [];
    const reportIds = normalizeIds(normalizedTargets.map((item) => item.id));
    const expectedById = new Map(normalizedTargets.map((item) => [Number(item.id), item.expected_updated_at || null]));
    const connection = await getConnection();
    const postCommitNotifications = [];
    const approvedIds = [];
    const dates = [];
    try {
      await beginTransaction(connection);
      const placeholders = reportIds.map(() => "?").join(",");
      const [rows] = await query(connection, `SELECT DISTINCT temp.id,temp.worker_id,temp.process_id,temp.work_date,temp.entry_date,temp.shift,temp.operation_type,temp.operation_mode,temp.machine_no,temp.product_name,temp.total_time,temp.actual_time,temp.deduction_time,temp.standard_output,temp.standard_version_id,temp.machine_standard_id,temp.training_percent_snapshot,temp.exclude_kqd_from_tt_snapshot,temp.actual_output,temp.tt_ok,temp.tt_ng,temp.kqd_dap_lai,temp.kqd_tuot,temp.vo_do_long,temp.xuoc_do_long,temp.cong_gay,temp.xoay,temp.khong_dut,temp.bavia_hut,temp.ppcm,temp.loi_cao_su,temp.ng_kich_thuoc,temp.cat_lem,temp.note,temp.extra_data,temp.status,temp.review_note,temp.updated_at,w.user_id AS worker_user_id FROM production_reports_temp temp JOIN workers w ON w.id=temp.worker_id WHERE temp.id IN (${placeholders}) FOR UPDATE`, reportIds);
      if (rows.length !== reportIds.length) throw new Error("Có báo cáo không tồn tại hoặc không thể duyệt");
      for (const row of rows) {
        const expected = expectedById.get(Number(row.id));
        if (expected && new Date(expected).getTime() !== new Date(row.updated_at).getTime()) { const error = new Error(`Báo cáo #${row.id} đã thay đổi sau khi bạn mở danh sách. Hãy tải lại trước khi thử lại.`); error.status = 409; error.code = "TEMP_REPORT_VERSION_CONFLICT"; throw error; }
        if (!['pending','need_fix'].includes(String(row.status))) throw new Error(`Báo cáo #${row.id} không ở trạng thái có thể duyệt`);
        const payload = buildApprovalPayload(row);
        const [insertResult] = await query(connection, `INSERT INTO production_reports (source_temp_id,worker_id,process_id,work_date,entry_date,shift,operation_type,operation_mode,machine_no,product_name,total_time,actual_time,deduction_time,standard_output,standard_version_id,machine_standard_id,training_percent_snapshot,exclude_kqd_from_tt_snapshot,actual_output,tt_ok,tt_ng,kqd_dap_lai,kqd_tuot,vo_do_long,xuoc_do_long,cong_gay,xoay,khong_dut,bavia_hut,ppcm,loi_cao_su,ng_kich_thuoc,cat_lem,note,extra_data,status,review_note,reviewed_by,approved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`, [row.id,row.worker_id,row.process_id,row.work_date,row.entry_date || row.work_date,row.shift,row.operation_type ?? null,row.operation_mode ?? null,row.machine_no,row.product_name,row.total_time,row.actual_time,row.deduction_time,row.standard_output,row.standard_version_id || null,row.machine_standard_id || null,row.training_percent_snapshot ?? null,row.exclude_kqd_from_tt_snapshot ?? null,row.actual_output,row.tt_ok,row.tt_ng,row.kqd_dap_lai,row.kqd_tuot,row.vo_do_long,row.xuoc_do_long,row.cong_gay,row.xoay,row.khong_dut,row.bavia_hut,row.ppcm,row.loi_cao_su,row.ng_kich_thuoc,row.cat_lem,row.note,serializeExtraData(row.extra_data),'approved',null,reviewerId]);
        const approvedReportId = insertResult.insertId; approvedIds.push(approvedReportId);
        const workDate = row.work_date instanceof Date ? `${row.work_date.getFullYear()}-${String(row.work_date.getMonth()+1).padStart(2,"0")}-${String(row.work_date.getDate()).padStart(2,"0")}` : String(row.work_date).slice(0,10); dates.push(workDate);
        await query(connection, `INSERT INTO production_report_defects (report_id, defect_type_id, quantity) SELECT ?,defect_type_id,quantity FROM production_temp_defects WHERE temp_report_id=?`, [approvedReportId,row.id]);
        await query(connection, `INSERT INTO production_report_deductions (report_id,deduction_type_id,hours) SELECT ?,deduction_type_id,hours FROM production_temp_deductions WHERE temp_report_id=?`, [approvedReportId,row.id]);
        await query(connection, `UPDATE production_reports_temp SET status='approved',reviewed_by=?,approved_at=NOW(),updated_at=NOW() WHERE id=?`, [reviewerId,row.id]);
        await AuditService.logAction({reportType:'temp',reportId:row.id,userId:reviewerId,action:'APPROVE',note:`Duyệt báo cáo thành công #${approvedReportId}`},connection);
        await AuditService.logAction({reportType:'approved',reportId:approvedReportId,userId:reviewerId,action:'CREATE',note:`Tạo báo cáo đã duyệt #${row.id}`},connection);
        await AuditService.logActivity({userId:reviewerId,action:'REPORT_APPROVED',entityType:'approved_report',entityId:approvedReportId,description:`Duyệt báo cáo #${row.id} thành báo cáo đã duyệt #${approvedReportId}`,metadata:{temp_report_id:row.id,approved_report_id:approvedReportId,worker_id:row.worker_id,process_id:row.process_id,work_date:row.work_date,shift:row.shift}},connection);
        postCommitNotifications.push({userIds:[row.worker_user_id],payload:{type:'report_approved',title:'Báo cáo đã được duyệt',message:`Báo cáo ngày ${workDate}, ca ${row.shift || '-'}, sản phẩm ${row.product_name || '-'} đã được duyệt.`,linkUrl:`/worker/history/${approvedReportId}?source=approved`,entityType:'approved_report',entityId:approvedReportId}});
      }
      await commit(connection);
      for (const notification of postCommitNotifications) { try { await AuditService.notifyUsers(notification.userIds, notification.payload); } catch (error) { console.warn(`[KTC] Post-commit approval notification failed: ${error.message}`); } }
      return {count:rows.length,temp_ids:rows.map((row)=>row.id),approved_ids:approvedIds,dates:[...new Set(dates)]};
    } catch (error) { await rollback(connection); throw error; } finally { connection.release(); }
  },
  async rejectSelected(targets, reviewerId, reason, isAdmin = false) {
    assertReviewBatchSize(targets); const normalizedTargets = Array.isArray(targets) ? targets.map((item)=>typeof item === 'object' ? item : {id:item,expected_updated_at:null}) : []; const reportIds = normalizeIds(normalizedTargets.map((item)=>item.id)); const expectedById = new Map(normalizedTargets.map((item)=>[Number(item.id),item.expected_updated_at || null])); const cleanReason = String(reason || '').trim(); if (!reportIds.length) throw new Error('Danh sách báo cáo không hợp lệ'); if (!cleanReason) throw new Error('Vui lòng nhập lý do từ chối');
    const connection = await getConnection(); const postCommitNotifications=[];
    try { await beginTransaction(connection); const placeholders=reportIds.map(()=>'?').join(','); const scopeJoin=isAdmin?'':'JOIN manager_processes mp ON mp.process_id=temp.process_id'; const scopeWhere=isAdmin?'':'AND mp.manager_id=?'; const params=isAdmin?[...reportIds]:[...reportIds,reviewerId]; const [rows]=await query(connection,`SELECT DISTINCT temp.id,temp.worker_id,temp.process_id,temp.work_date,temp.shift,temp.updated_at,w.user_id AS worker_user_id FROM production_reports_temp temp JOIN workers w ON w.id=temp.worker_id ${scopeJoin} WHERE temp.id IN (${placeholders}) AND temp.status IN ('pending','need_fix') ${scopeWhere} FOR UPDATE`,params); if(rows.length!==reportIds.length) throw new Error('Có báo cáo không tồn tại, đã xử lý hoặc người phê duyệt không có quyền truy cập'); for(const row of rows){ const expected=expectedById.get(Number(row.id)); if(expected&&new Date(expected).getTime()!==new Date(row.updated_at).getTime()){const error=new Error(`Báo cáo #${row.id} đã thay đổi sau khi bạn mở danh sách. Hãy tải lại trước khi thử lại.`); error.status=409; error.code='TEMP_REPORT_VERSION_CONFLICT'; throw error;} await query(connection,`UPDATE production_reports_temp SET status='rejected',review_note=?,reviewed_by=?,updated_at=NOW() WHERE id=?`,[cleanReason,reviewerId,row.id]); await AuditService.logAction({reportType:'temp',reportId:row.id,userId:reviewerId,action:'REJECT',note:cleanReason},connection); await AuditService.logActivity({userId:reviewerId,action:'REPORT_REJECTED',entityType:'temp_report',entityId:row.id,description:`Từ chối báo cáo #${row.id}: ${cleanReason}`,metadata:{reason:cleanReason,worker_id:row.worker_id,process_id:row.process_id}},connection); postCommitNotifications.push({userIds:[row.worker_user_id],payload:{type:'report_rejected',title:'Báo cáo đã bị từ chối',message:`Báo cáo ngày ${String(row.work_date).slice(0,10)}, ca ${row.shift || '-'} bị từ chối: ${cleanReason}`,linkUrl:`/worker/history/${row.id}?source=pending`,entityType:'temp_report',entityId:row.id}}); } await commit(connection); for(const notification of postCommitNotifications){try{await AuditService.notifyUsers(notification.userIds,notification.payload);}catch(error){console.warn(`[KTC] Post-commit rejection notification failed: ${error.message}`);}} return {count:rows.length,ids:rows.map((row)=>row.id)}; } catch(error){await rollback(connection);throw error;} finally{connection.release();}
  }
};
