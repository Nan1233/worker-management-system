const db = require('../config/db');
const { publicMessage } = require('../utils/httpError');
const { createApprovedReportVersion } = require('../services/approvedVersionSnapshotService');
const { loadApprovedSnapshot } = require('../services/approvedReportEditService');
const runtimeMetrics = require('../services/runtimeMetrics');
const { buildApprovalPayload } = require('../services/productionApprovalService');
const { syncApprovedReportToExcel } = require('../services/productionReportSideEffectsService');

const query = (executor, sql, params = []) => executor.promise
  ? executor.promise().query(sql, params)
  : executor.query(sql, params);

const begin = async (connection) => connection.beginTransaction();
const commit = async (connection) => connection.commit();
const rollback = async (connection) => connection.rollback();

async function getConnection() {
  return db.promise().getConnection();
}

module.exports = {
  async copyMachineLinesToApproved(tempReportId, approvedReportId, connection) {
    await query(connection, `INSERT INTO production_report_machine_lines
      (report_id, machine_event_id, machine_id, machine_code, product_standard_id, standard_version_id, machine_standard_id,
       product_code, machine_time_hours, standard_output, standard_time_seconds, standard_source, exclude_kqd_from_tt,
       ok_quantity, ng_quantity, maximum_output, deduction_time_hours, deductions_json, counted_output, earned_standard_hours, defects_json, sort_order)
      SELECT ?, machine_event_id, machine_id, machine_code, product_standard_id, standard_version_id, machine_standard_id,
             product_code, machine_time_hours, standard_output, standard_time_seconds, standard_source, exclude_kqd_from_tt,
             ok_quantity, ng_quantity, maximum_output, deduction_time_hours, deductions_json, counted_output, earned_standard_hours, defects_json, sort_order
      FROM production_temp_machine_lines WHERE temp_report_id=? ORDER BY sort_order,id`,
      [Number(approvedReportId), Number(tempReportId)]);
    const [sourceRows] = await query(connection, `SELECT id FROM production_temp_machine_lines WHERE temp_report_id=? ORDER BY sort_order,id`, [Number(tempReportId)]);
    if (!sourceRows.length) return;
    const sourceIds = sourceRows.map((row) => Number(row.id)).filter(Number.isInteger);
    const placeholders = sourceIds.map(() => '?').join(',');
    await query(connection, `INSERT INTO production_report_machine_defects (machine_line_id, defect_code, quantity)
      SELECT prml.id, d.defect_code, d.quantity
      FROM production_temp_machine_defects d
      JOIN production_temp_machine_lines ptml ON ptml.id=d.machine_line_id
      JOIN production_report_machine_lines prml ON prml.report_id=? AND prml.machine_code=ptml.machine_code
      WHERE d.machine_line_id IN (${placeholders})`, [Number(approvedReportId), ...sourceIds]);
  },

  async approveSelected(ids, reviewerId, options = {}) {
    const connection = await getConnection();
    const startedAt = Date.now();
    try {
      await begin(connection);
      const reportIds = [...new Set((ids || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
      if (!reportIds.length) { const err = new Error('Không có báo cáo hợp lệ để duyệt'); err.status = 400; throw err; }
      const placeholders = reportIds.map(() => '?').join(',');
      const [rows] = await query(connection, `SELECT * FROM production_reports_temp WHERE id IN (${placeholders}) FOR UPDATE`, reportIds);
      const found = new Map(rows.map((row) => [Number(row.id), row]));
      const approved = [];
      for (const reportId of reportIds) {
        const temp = found.get(reportId);
        if (!temp || String(temp.status) !== 'pending') continue;
        const payload = buildApprovalPayload(temp);
        const [insertResult] = await query(connection, `INSERT INTO production_reports
          (source_temp_id,worker_id,process_id,work_date,entry_date,shift,operation_type,operation_mode,machine_no,product_name,
           total_time,actual_time,deduction_time,standard_output,standard_version_id,machine_standard_id,
           training_percent_snapshot,exclude_kqd_from_tt_snapshot,actual_output,tt_ok,tt_ng,kqd_dap_lai,kqd_tuot,vo_do_long,
           xuoc_do_long,cong_gay,xoay,khong_dut,bavia_hut,ppcm,loi_cao_su,ng_kich_thuoc,cat_lem,note,extra_data,status,review_note,reviewed_by,approved_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`, [
            temp.id,temp.worker_id,temp.process_id,temp.work_date,temp.entry_date,temp.shift,temp.operation_type,temp.operation_mode,
            temp.machine_no,temp.product_name,payload.total_time,payload.actual_time,payload.deduction_time,payload.standard_output,
            temp.standard_version_id,temp.machine_standard_id,temp.training_percent_snapshot,temp.exclude_kqd_from_tt_snapshot,
            payload.actual_output,temp.tt_ok,temp.tt_ng,temp.kqd_dap_lai,temp.kqd_tuot,temp.vo_do_long,temp.xuoc_do_long,temp.cong_gay,
            temp.xoay,temp.khong_dut,temp.bavia_hut,temp.ppcm,temp.loi_cao_su,temp.ng_kich_thuoc,temp.cat_lem,temp.note,temp.extra_data,
            'approved',options.review_note || null,reviewerId]);
        const approvedId = Number(insertResult.insertId);
        await this.copyMachineLinesToApproved(temp.id, approvedId, connection);
        await query(connection, `UPDATE production_reports_temp SET status='approved', reviewed_by=?, approved_at=NOW(), updated_at=NOW() WHERE id=?`, [reviewerId, temp.id]);
        approved.push({ tempId: temp.id, reportId: approvedId });
      }
      await commit(connection);
      for (const item of approved) {
        Promise.resolve(syncApprovedReportToExcel?.(item.reportId)).catch((error) => console.error('APPROVAL EXCEL SIDE EFFECT ERROR:', error));
        Promise.resolve(createApprovedReportVersion?.({ reportId: item.reportId, reason: 'Duyệt báo cáo', userId: reviewerId })).catch((error) => console.error('APPROVAL VERSION SIDE EFFECT ERROR:', error));
      }
      return { approved, durationMs: Date.now() - startedAt };
    } catch (error) { try { await rollback(connection); } catch (_) {} throw error; }
    finally { connection.release(); }
  },
};
