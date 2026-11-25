'use strict';
const { eventError } = require('../domain/machineProductionEvent');

function q(executor, sql, params = []) {
  if (executor?.promise) return executor.promise().query(sql, params).then(([rows]) => rows);
  const ctor = String(executor?.constructor?.name || '');
  if (ctor.includes('Promise')) return executor.query(sql, params).then(([rows]) => rows);
  return new Promise((resolve, reject) => {
    executor.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

async function participantRows(executor, eventId) {
  return q(executor, `SELECT * FROM (
    SELECT 'temp' source, ml.id machine_line_id, r.id report_id, r.worker_id, r.status report_status,
           r.process_id, r.work_date, r.shift, ml.machine_id, ml.machine_code, ml.product_code,
           ml.counted_output credited_output, ml.machine_time_hours participation_time_hours
      FROM production_temp_machine_lines ml JOIN production_reports_temp r ON r.id=ml.temp_report_id
     WHERE ml.machine_event_id=?
    UNION ALL
    SELECT 'approved' source, ml.id machine_line_id, r.id report_id, r.worker_id, r.status report_status,
           r.process_id, r.work_date, r.shift, ml.machine_id, ml.machine_code, ml.product_code,
           ml.counted_output credited_output, ml.machine_time_hours participation_time_hours
      FROM production_report_machine_lines ml JOIN production_reports r ON r.id=ml.report_id
     WHERE ml.machine_event_id=?
  ) x ORDER BY worker_id, source, machine_line_id`, [Number(eventId), Number(eventId)]);
}

async function loadEvent(executor, id, { lock = false } = {}) {
  const rows = await q(executor, `SELECT e.*, p.process_code, p.process_name
    FROM machine_production_events e JOIN processes p ON p.id=e.process_id
    WHERE e.id=? ${lock ? 'FOR UPDATE' : ''}`, [Number(id)]);
  if (!rows[0]) throw eventError(404, 'MACHINE_EVENT_NOT_FOUND', 'Không tìm thấy production event');
  return rows[0];
}

module.exports = { q, participantRows, loadEvent };
