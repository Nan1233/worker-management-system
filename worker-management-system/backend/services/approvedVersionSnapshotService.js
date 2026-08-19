const APPROVED_SNAPSHOT_SCHEMA_VERSION = 2;

const REPORT_FIELDS = [
  'id','source_temp_id','worker_id','process_id',
  'work_date','entry_date','shift','operation_type','operation_mode',
  'machine_no','product_name',
  'total_time','actual_time','deduction_time',
  'standard_output','standard_version_id','machine_standard_id',
  'training_percent_snapshot','exclude_kqd_from_tt_snapshot',
  'actual_output','tt_ok','tt_ng',
  // Legacy approved aggregate columns remain business state until a later cleanup wave removes them.
  'kqd_dap_lai','kqd_tuot','vo_do_long','xuoc_do_long','cong_gay','xoay','khong_dut',
  'bavia_hut','ppcm','loi_cao_su','ng_kich_thuoc','cat_lem',
  'note','extra_data','status','review_note'
];

const MACHINE_LINE_FIELDS = [
  'machine_event_id','machine_id','machine_code',
  'product_standard_id','standard_version_id','machine_standard_id','product_code',
  'machine_time_hours','standard_output','standard_time_seconds','standard_source',
  'exclude_kqd_from_tt','ok_quantity','ng_quantity','maximum_output',
  'deduction_time_hours','deductions_json','counted_output','earned_standard_hours',
  'defects_json','sort_order'
];

function query(executor, sql, params = []) {
  return executor.promise ? executor.promise().query(sql, params) : executor.query(sql, params);
}

function pick(source, fields) {
  const out = {};
  for (const field of fields) out[field] = source?.[field] ?? null;
  return out;
}

function toPlainJson(value) {
  if (value === null || value === undefined || value === '') return value ?? null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return value; }
}

function sanitizeReport(row) {
  const report = pick(row, REPORT_FIELDS);
  report.extra_data = toPlainJson(report.extra_data);
  return report;
}

function sanitizeMachineLine(row) {
  const line = pick(row, MACHINE_LINE_FIELDS);
  line.deductions_json = toPlainJson(line.deductions_json);
  line.defects_json = toPlainJson(line.defects_json);
  return line;
}

async function loadApprovedAggregateSnapshot({ reportId, executor = null }) {
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const activeExecutor = executor || require('../config/db');

  const [[reports], [defects], [deductions], [machineLines], [machineDefects]] = await Promise.all([
    query(activeExecutor, 'SELECT * FROM production_reports WHERE id=? LIMIT 1', [id]),
    query(activeExecutor,
      `SELECT defect_type_id, quantity
       FROM production_report_defects
       WHERE report_id=?
       ORDER BY defect_type_id ASC, id ASC`, [id]),
    query(activeExecutor,
      `SELECT deduction_type_id, hours
       FROM production_report_deductions
       WHERE report_id=?
       ORDER BY deduction_type_id ASC, id ASC`, [id]),
    query(activeExecutor,
      `SELECT *
       FROM production_report_machine_lines
       WHERE report_id=?
       ORDER BY sort_order ASC, id ASC`, [id]),
    query(activeExecutor,
      `SELECT md.machine_line_id, md.defect_type_id, md.defect_code, md.defect_name, md.quantity
       FROM production_report_machine_defects md
       INNER JOIN production_report_machine_lines ml ON ml.id=md.machine_line_id
       WHERE ml.report_id=?
       ORDER BY ml.sort_order ASC, ml.id ASC, md.defect_code ASC, md.defect_type_id ASC, md.id ASC`, [id])
  ]);

  if (!reports[0]) return null;

  const defectsByLineId = new Map();
  for (const defect of machineDefects) {
    const key = Number(defect.machine_line_id);
    if (!defectsByLineId.has(key)) defectsByLineId.set(key, []);
    defectsByLineId.get(key).push({
      defect_type_id: defect.defect_type_id ?? null,
      defect_code: defect.defect_code ?? null,
      defect_name: defect.defect_name ?? null,
      quantity: defect.quantity ?? 0
    });
  }

  return {
    schemaVersion: APPROVED_SNAPSHOT_SCHEMA_VERSION,
    report: sanitizeReport(reports[0]),
    defects: defects.map((row) => ({
      defect_type_id: row.defect_type_id ?? null,
      quantity: row.quantity ?? 0
    })),
    deductions: deductions.map((row) => ({
      deduction_type_id: row.deduction_type_id ?? null,
      hours: row.hours ?? 0
    })),
    machineLines: machineLines.map((row) => ({
      line: sanitizeMachineLine(row),
      defects: defectsByLineId.get(Number(row.id)) || []
    }))
  };
}

function parseSnapshotJson(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

function positiveIntegerOrNull(value) {
  return value === null || value === undefined || value === '' || (Number.isInteger(Number(value)) && Number(value) > 0);
}

function isMachineMode(report) {
  return String(report?.operation_mode || '').trim().toUpperCase() === 'MACHINE';
}

function pushIssue(issues, code, path, message) {
  issues.push({ code, path, message });
}

function validateApprovedVersionSnapshot(value) {
  const snapshot = parseSnapshotJson(value);
  const issues = [];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { valid: false, schemaVersion: null, issues: [{ code: 'ROLLBACK_SNAPSHOT_INVALID', path: '$', message: 'Snapshot phải là object JSON' }] };
  }

  const schemaVersion = Number(snapshot.schemaVersion || 0) || null;
  if (schemaVersion !== APPROVED_SNAPSHOT_SCHEMA_VERSION) {
    pushIssue(issues, 'ROLLBACK_UNSUPPORTED_SCHEMA_VERSION', 'schemaVersion', 'Snapshot không dùng schemaVersion 2');
    return { valid: false, schemaVersion, issues };
  }

  if (!snapshot.report || typeof snapshot.report !== 'object' || Array.isArray(snapshot.report)) {
    pushIssue(issues, 'ROLLBACK_SNAPSHOT_INVALID', 'report', 'Thiếu report object');
  }
  for (const field of ['defects','deductions','machineLines']) {
    if (!Array.isArray(snapshot[field])) pushIssue(issues, 'ROLLBACK_CHILD_GRAPH_INCOMPLETE', field, `${field} phải là array`);
  }
  if (issues.length) return { valid: false, schemaVersion, issues };

  const report = snapshot.report;
  for (const field of ['id','worker_id','process_id']) {
    if (!Number.isInteger(Number(report[field])) || Number(report[field]) <= 0) {
      pushIssue(issues, 'ROLLBACK_SNAPSHOT_INVALID', `report.${field}`, `${field} không hợp lệ`);
    }
  }
  for (const field of ['standard_output','actual_output','tt_ok','tt_ng','total_time','actual_time','deduction_time']) {
    if (!finiteNonNegative(report[field])) pushIssue(issues, 'ROLLBACK_SNAPSHOT_INVALID', `report.${field}`, `${field} phải là số không âm`);
  }
  if (!isMachineMode(report) && !positiveIntegerOrNull(report.standard_version_id)) {
    pushIssue(issues, 'ROLLBACK_MISSING_STANDARD_SNAPSHOT', 'report.standard_version_id', 'standard_version_id không hợp lệ');
  }
  if (!isMachineMode(report) && (report.standard_version_id === null || report.standard_version_id === undefined || report.standard_version_id === '')) {
    pushIssue(issues, 'ROLLBACK_MISSING_STANDARD_SNAPSHOT', 'report.standard_version_id', 'Báo cáo tay thiếu historical standard version');
  }
  if (!positiveIntegerOrNull(report.machine_standard_id)) {
    pushIssue(issues, 'ROLLBACK_MISSING_STANDARD_SNAPSHOT', 'report.machine_standard_id', 'machine_standard_id không hợp lệ');
  }
  if (report.training_percent_snapshot === null || report.training_percent_snapshot === undefined || report.training_percent_snapshot === '') {
    pushIssue(issues, 'ROLLBACK_MISSING_TRAINING_SNAPSHOT', 'report.training_percent_snapshot', 'Thiếu snapshot % học việc');
  } else if (!finiteNonNegative(report.training_percent_snapshot) || Number(report.training_percent_snapshot) > 100) {
    pushIssue(issues, 'ROLLBACK_SNAPSHOT_INVALID', 'report.training_percent_snapshot', 'Snapshot % học việc không hợp lệ');
  }
  if (report.exclude_kqd_from_tt_snapshot === null || report.exclude_kqd_from_tt_snapshot === undefined || report.exclude_kqd_from_tt_snapshot === '' || ![0,1].includes(Number(report.exclude_kqd_from_tt_snapshot))) {
    pushIssue(issues, 'ROLLBACK_MISSING_KQD_POLICY', 'report.exclude_kqd_from_tt_snapshot', 'Thiếu/không hợp lệ snapshot chính sách KQD');
  }

  snapshot.defects.forEach((item, index) => {
    if (!item || !Number.isInteger(Number(item.defect_type_id)) || Number(item.defect_type_id) <= 0 || !finiteNonNegative(item.quantity)) {
      pushIssue(issues, 'ROLLBACK_SNAPSHOT_INVALID', `defects[${index}]`, 'Defect snapshot không hợp lệ');
    }
  });
  snapshot.deductions.forEach((item, index) => {
    if (!item || !Number.isInteger(Number(item.deduction_type_id)) || Number(item.deduction_type_id) <= 0 || !finiteNonNegative(item.hours)) {
      pushIssue(issues, 'ROLLBACK_SNAPSHOT_INVALID', `deductions[${index}]`, 'Deduction snapshot không hợp lệ');
    }
  });

  const seenLineKeys = new Set();
  snapshot.machineLines.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || !entry.line || typeof entry.line !== 'object' || !Array.isArray(entry.defects)) {
      pushIssue(issues, 'ROLLBACK_CHILD_GRAPH_INCOMPLETE', `machineLines[${index}]`, 'Machine line phải có line object và defects array');
      return;
    }
    const line = entry.line;
    const lineKey = `${line.sort_order ?? ''}|${line.machine_code ?? ''}|${line.product_code ?? ''}`;
    if (seenLineKeys.has(lineKey)) pushIssue(issues, 'ROLLBACK_SNAPSHOT_INVALID', `machineLines[${index}]`, 'Machine line snapshot bị trùng identity trong payload');
    seenLineKeys.add(lineKey);
    if (!String(line.machine_code || '').trim() || !String(line.product_code || '').trim()) {
      pushIssue(issues, 'ROLLBACK_SNAPSHOT_INVALID', `machineLines[${index}].line`, 'Thiếu machine_code/product_code');
    }
    for (const field of ['machine_time_hours','standard_output','maximum_output','deduction_time_hours','counted_output','earned_standard_hours','ok_quantity','ng_quantity']) {
      if (!finiteNonNegative(line[field])) pushIssue(issues, 'ROLLBACK_SNAPSHOT_INVALID', `machineLines[${index}].line.${field}`, `${field} phải là số không âm`);
    }
    if (!positiveIntegerOrNull(line.machine_event_id)) pushIssue(issues, 'ROLLBACK_EVENT_LINK_UNKNOWN', `machineLines[${index}].line.machine_event_id`, 'machine_event_id không hợp lệ');
    if (!positiveIntegerOrNull(line.standard_version_id) || line.standard_version_id === null || line.standard_version_id === undefined || line.standard_version_id === '') {
      pushIssue(issues, 'ROLLBACK_MISSING_STANDARD_SNAPSHOT', `machineLines[${index}].line.standard_version_id`, 'Machine line thiếu historical standard version');
    }
    if (!positiveIntegerOrNull(line.machine_standard_id)) pushIssue(issues, 'ROLLBACK_MISSING_STANDARD_SNAPSHOT', `machineLines[${index}].line.machine_standard_id`, 'machine_standard_id machine line không hợp lệ');
    if (line.exclude_kqd_from_tt === null || line.exclude_kqd_from_tt === undefined || line.exclude_kqd_from_tt === '' || ![0,1].includes(Number(line.exclude_kqd_from_tt))) pushIssue(issues, 'ROLLBACK_MISSING_KQD_POLICY', `machineLines[${index}].line.exclude_kqd_from_tt`, 'Machine line thiếu KQD policy snapshot');
    entry.defects.forEach((defect, defectIndex) => {
      if (!defect || !String(defect.defect_code || '').trim() || !finiteNonNegative(defect.quantity)) {
        pushIssue(issues, 'ROLLBACK_SNAPSHOT_INVALID', `machineLines[${index}].defects[${defectIndex}]`, 'Machine defect snapshot không hợp lệ');
      }
    });
  });

  return { valid: issues.length === 0, schemaVersion, issues };
}

function classifyApprovedVersionSnapshot(value) {
  const snapshot = parseSnapshotJson(value);
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return {
      classification: 'UNRESOLVED', restore_safe: 'NO', schema_version: null,
      missing_components: ['snapshot_json'], reasons: ['ROLLBACK_SNAPSHOT_INVALID']
    };
  }

  const schemaVersion = Number(snapshot.schemaVersion || 0) || null;
  if (schemaVersion !== APPROVED_SNAPSHOT_SCHEMA_VERSION) {
    const reasons = ['ROLLBACK_PARENT_ONLY_VERSION'];
    const missing = [];
    if (!Object.prototype.hasOwnProperty.call(snapshot, 'machineLines')) {
      reasons.push('ROLLBACK_CHILD_GRAPH_INCOMPLETE'); missing.push('machineLines');
    }
    const legacyReport = snapshot.report && typeof snapshot.report === 'object' ? snapshot.report : snapshot;
    if (legacyReport.standard_version_id === null || legacyReport.standard_version_id === undefined) {
      reasons.push('ROLLBACK_MISSING_STANDARD_SNAPSHOT'); missing.push('standard_version_id');
    }
    if (legacyReport.training_percent_snapshot === null || legacyReport.training_percent_snapshot === undefined) {
      reasons.push('ROLLBACK_MISSING_TRAINING_SNAPSHOT'); missing.push('training_percent_snapshot');
    }
    if (legacyReport.exclude_kqd_from_tt_snapshot === null || legacyReport.exclude_kqd_from_tt_snapshot === undefined) {
      reasons.push('ROLLBACK_MISSING_KQD_POLICY'); missing.push('exclude_kqd_from_tt_snapshot');
    }
    if (!Object.prototype.hasOwnProperty.call(snapshot, 'machineLines')) {
      reasons.push('ROLLBACK_EVENT_LINK_UNKNOWN'); missing.push('machine_event_id');
    }
    return {
      classification: 'REVIEW_REQUIRED', restore_safe: 'REVIEW', schema_version: schemaVersion,
      missing_components: [...new Set(missing)], reasons: [...new Set(reasons)]
    };
  }

  const validation = validateApprovedVersionSnapshot(snapshot);
  if (validation.valid) {
    return { classification: 'RESTORE_SAFE', restore_safe: 'YES', schema_version: schemaVersion, missing_components: [], reasons: [] };
  }
  const reasons = [...new Set(validation.issues.map((issue) => issue.code))];
  const missing = validation.issues
    .filter((issue) => issue.code.startsWith('ROLLBACK_MISSING_') || issue.code === 'ROLLBACK_CHILD_GRAPH_INCOMPLETE' || issue.code === 'ROLLBACK_EVENT_LINK_UNKNOWN')
    .map((issue) => issue.path);
  return {
    classification: reasons.includes('ROLLBACK_SNAPSHOT_INVALID') ? 'UNRESOLVED' : 'REVIEW_REQUIRED',
    restore_safe: reasons.includes('ROLLBACK_SNAPSHOT_INVALID') ? 'NO' : 'REVIEW',
    schema_version: schemaVersion,
    missing_components: [...new Set(missing)], reasons
  };
}

const SNAPSHOT_NUMERIC_COMPARE_FIELDS = new Set([
  // Parent/report numeric business state and immutable source identities.
  'id','source_temp_id','worker_id','process_id',
  'total_time','actual_time','deduction_time',
  'standard_output','standard_version_id','machine_standard_id',
  'training_percent_snapshot','exclude_kqd_from_tt_snapshot',
  'actual_output','tt_ok','tt_ng',
  'kqd_dap_lai','kqd_tuot','vo_do_long','xuoc_do_long','cong_gay','xoay','khong_dut',
  'bavia_hut','ppcm','loi_cao_su','ng_kich_thuoc','cat_lem',
  // Child identities/quantities and machine-line accounting fields.
  'defect_type_id','deduction_type_id','quantity','hours',
  'machine_event_id','machine_id','product_standard_id',
  'machine_time_hours','standard_time_seconds','exclude_kqd_from_tt',
  'ok_quantity','ng_quantity','maximum_output','deduction_time_hours',
  'counted_output','earned_standard_hours','sort_order'
]);

const SNAPSHOT_DATE_COMPARE_FIELDS = new Set(['work_date','entry_date']);

function normalizeComparableNumber(value) {
  if (value === null || value === undefined || value === '') return value ?? null;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function stableComparable(value, key = null) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (key && SNAPSHOT_DATE_COMPARE_FIELDS.has(key)) return normalizeDateForComparison(value);
  if (key && SNAPSHOT_NUMERIC_COMPARE_FIELDS.has(key)) return normalizeComparableNumber(value);
  if (Array.isArray(value)) return value.map((item) => stableComparable(item));
  if (value && typeof value === 'object') {
    const out = {};
    for (const childKey of Object.keys(value).sort()) out[childKey] = stableComparable(value[childKey], childKey);
    return out;
  }
  return value;
}

function normalizeDateForComparison(value) {
  if (value === null || value === undefined || value === '') return value ?? null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function approvedSnapshotsEqual(left, right) {
  const a = parseSnapshotJson(left);
  const b = parseSnapshotJson(right);
  if (!a || !b) return false;
  return JSON.stringify(stableComparable(a)) === JSON.stringify(stableComparable(b));
}

function rollbackSnapshotError(code, message, details) {
  const error = new Error(message);
  error.status = 422;
  error.code = code;
  error.isPublic = true;
  if (details) error.details = details;
  return error;
}

function assertApprovedVersionSnapshotSafe(snapshot) {
  const validation = validateApprovedVersionSnapshot(snapshot);
  if (!validation.valid) {
    throw rollbackSnapshotError('ROLLBACK_VERSION_UNSAFE', 'Phiên bản báo cáo chưa đủ dữ liệu lịch sử để khôi phục an toàn', validation.issues);
  }
  return snapshot;
}

async function createApprovedReportVersion({ reportId, reason, userId }, executor = null) {
  const activeExecutor = executor || require('../config/db');
  const snapshot = await loadApprovedAggregateSnapshot({ reportId, executor: activeExecutor });
  if (!snapshot) throw rollbackSnapshotError('ROLLBACK_SNAPSHOT_INVALID', 'Không tìm thấy báo cáo đã duyệt để tạo phiên bản');
  const validation = validateApprovedVersionSnapshot(snapshot);
  const structuralIssues = validation.issues.filter((issue) =>
    issue.code === 'ROLLBACK_SNAPSHOT_INVALID' || issue.code === 'ROLLBACK_CHILD_GRAPH_INCOMPLETE'
  );
  if (structuralIssues.length) {
    throw rollbackSnapshotError('ROLLBACK_SNAPSHOT_INVALID', 'Không thể tạo phiên bản vì aggregate snapshot không hợp lệ', structuralIssues);
  }
  // Capture exact stored historical state. Unsafe legacy values stay explicit and are scanner-visible;
  // never hydrate them from current masters here.
  const AuditService = require('./auditService');
  return AuditService.createReportVersion({
    reportType: 'approved', reportId: Number(reportId), snapshot, reason, userId
  }, activeExecutor);
}

module.exports = {
  APPROVED_SNAPSHOT_SCHEMA_VERSION,
  REPORT_FIELDS,
  MACHINE_LINE_FIELDS,
  loadApprovedAggregateSnapshot,
  validateApprovedVersionSnapshot,
  assertApprovedVersionSnapshotSafe,
  classifyApprovedVersionSnapshot,
  createApprovedReportVersion,
  parseSnapshotJson,
  approvedSnapshotsEqual
};
