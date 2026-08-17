const db = require('../config/db');
const AuditService = require('./auditService');

const DEFAULT_SETTINGS = Object.freeze({
  scope_code: 'GLOBAL',
  process_id: null,
  process_code: null,
  process_name: 'Áp dụng chung',
  effective_from: null,
  effective_to: null,
  apply_training_percent: 1,
  output_formula: 'ENTERED_X_TRAINING',
  output_per_hour_formula: 'ADJUSTED_OUTPUT_DIV_ACTUAL_TIME',
  achievement_formula: 'OUTPUT_PER_HOUR_DIV_STANDARD',
  ng_rate_formula: 'NG_DIV_OK_PLUS_NG',
  actual_time_formula: 'DATABASE_SNAPSHOT',
  threshold_red: 80,
  threshold_orange: 95,
  threshold_yellow: 100,
  threshold_green: 110,
  version_no: 1
});

let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 15_000;

async function ensureSchema() {
  // Schema ownership belongs exclusively to the canonical database snapshot.
  // Kept as a compatibility no-op for existing callers. Startup/readiness
  // already fail closed if migration 025 or any required schema is missing.
}

function normalizePercent(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1000, Math.max(0, number));
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const error = new Error('Ngày hiệu lực phải có định dạng YYYY-MM-DD.');
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function normalizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const result = {
    ...base,
    ...input,
    effective_from: normalizeDate(input.effective_from ?? base.effective_from),
    effective_to: normalizeDate(input.effective_to ?? base.effective_to),
    apply_training_percent: input.apply_training_percent === false || Number(input.apply_training_percent) === 0 ? 0 : 1,
    threshold_red: normalizePercent(input.threshold_red, Number(base.threshold_red)),
    threshold_orange: normalizePercent(input.threshold_orange, Number(base.threshold_orange)),
    threshold_yellow: normalizePercent(input.threshold_yellow, Number(base.threshold_yellow)),
    threshold_green: normalizePercent(input.threshold_green, Number(base.threshold_green))
  };
  if (result.effective_from && result.effective_to && result.effective_to < result.effective_from) {
    const error = new Error('Ngày kết thúc hiệu lực phải bằng hoặc sau ngày bắt đầu.');
    error.statusCode = 400;
    throw error;
  }
  if (!(result.threshold_red < result.threshold_orange && result.threshold_orange < result.threshold_yellow && result.threshold_yellow < result.threshold_green)) {
    const error = new Error('Ngưỡng màu phải tăng dần: đỏ < cam < vàng < xanh.');
    error.statusCode = 400;
    throw error;
  }
  return result;
}

function normalizeRowDates(row) {
  if (!row) return row;
  return {
    ...row,
    effective_from: row.effective_from ? new Date(row.effective_from).toISOString().slice(0, 10) : null,
    effective_to: row.effective_to ? new Date(row.effective_to).toISOString().slice(0, 10) : null
  };
}

async function loadAll({ force = false } = {}) {
  if (!force && cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  await ensureSchema();
  const [processRows] = await db.promise().query(`
    SELECT id, process_code, process_name
    FROM processes
    WHERE status = 'active'
    ORDER BY id
  `);
  const [[settingRows], [historyRows]] = await Promise.all([
    db.promise().query(`
      SELECT scope_code, process_id, effective_from, effective_to, apply_training_percent, output_formula,
             output_per_hour_formula, achievement_formula, ng_rate_formula,
             actual_time_formula, threshold_red, threshold_orange,
             threshold_yellow, threshold_green, version_no, updated_at
      FROM production_formula_settings
    `),
    db.promise().query(`
      SELECT id, scope_code, process_id, effective_from, effective_to, settings_json,
             source_version_no, change_reason, created_by, created_at
      FROM production_formula_setting_versions
      ORDER BY created_at DESC, id DESC
    `)
  ]);
  const normalizedRows = settingRows.map(normalizeRowDates);
  const byScope = new Map(normalizedRows.map((row) => [String(row.scope_code), row]));
  const global = normalizeSettings(byScope.get('GLOBAL') || DEFAULT_SETTINGS, DEFAULT_SETTINGS);
  const scopes = [{ ...global, scope_code: 'GLOBAL', process_id: null, process_code: null, process_name: 'Áp dụng chung' }];
  for (const process of processRows) {
    const scopeCode = `PROCESS:${String(process.process_code).toUpperCase()}`;
    const own = byScope.get(scopeCode);
    scopes.push(normalizeSettings({
      ...(own || {}),
      scope_code: scopeCode,
      process_id: Number(process.id),
      process_code: process.process_code,
      process_name: process.process_name,
      inherits_global: own ? 0 : 1
    }, global));
  }
  const history = historyRows.map((row) => {
    let settings = row.settings_json;
    if (typeof settings === 'string') {
      try { settings = JSON.parse(settings); } catch { settings = {}; }
    }
    return normalizeRowDates({
      ...(settings && typeof settings === 'object' ? settings : {}),
      ...row,
      effective_from: row.effective_from ?? settings?.effective_from ?? null,
      effective_to: row.effective_to ?? settings?.effective_to ?? null
    });
  });
  cache = { global, scopes, processes: processRows, history };
  cacheAt = Date.now();
  return cache;
}

function isEffective(settings, referenceDate) {
  if (!referenceDate) return true;
  const date = String(referenceDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
  if (settings.effective_from && date < settings.effective_from) return false;
  if (settings.effective_to && date > settings.effective_to) return false;
  return true;
}

function historicalScopeFor(data, scopeCode, referenceDate, base) {
  if (!referenceDate) return null;
  const row = (data.history || []).find((item) =>
    String(item.scope_code) === String(scopeCode) && isEffective(item, referenceDate)
  );
  if (!row) return null;
  return normalizeSettings(row, base);
}

async function getSettingsMap(referenceDate = null) {
  const data = await loadAll();
  const global = isEffective(data.global, referenceDate)
    ? data.global
    : historicalScopeFor(data, 'GLOBAL', referenceDate, DEFAULT_SETTINGS)
      || { ...DEFAULT_SETTINGS, scope_code: 'GLOBAL' };
  const map = { GLOBAL: global };
  for (const scope of data.scopes) {
    if (!scope.process_code) continue;
    const historical = historicalScopeFor(data, scope.scope_code, referenceDate, global);
    map[String(scope.process_code).toUpperCase()] = isEffective(scope, referenceDate)
      ? scope
      : historical
        ? {
            ...historical,
            process_id: scope.process_id,
            process_code: scope.process_code,
            process_name: scope.process_name,
            inherits_global: 0
          }
        : {
            ...global,
            process_id: scope.process_id,
            process_code: scope.process_code,
            process_name: scope.process_name,
            inherits_global: 1
          };
  }
  return map;
}

async function archiveCurrentScope(scopeCode, reason, userId) {
  const [rows] = await db.promise().query(
    'SELECT * FROM production_formula_settings WHERE scope_code=? LIMIT 1',
    [scopeCode]
  );
  const current = rows[0];
  if (!current) return;
  await db.promise().query(
    `INSERT INTO production_formula_setting_versions
      (scope_code, process_id, effective_from, effective_to, settings_json, source_version_no, change_reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      scopeCode,
      current.process_id || null,
      current.effective_from || null,
      current.effective_to || null,
      JSON.stringify(current),
      Number(current.version_no || 1),
      String(reason || 'Cập nhật cấu hình công thức').slice(0, 500),
      Number(userId) || null
    ]
  );
}

async function saveScope(scopeCode, payload, userId) {
  const data = await loadAll();
  let process = null;
  if (scopeCode !== 'GLOBAL') {
    const processCode = String(scopeCode).replace(/^PROCESS:/, '').toUpperCase();
    process = data.processes.find((item) => String(item.process_code).toUpperCase() === processCode);
    if (!process) {
      const error = new Error('Không tìm thấy công đoạn cần cấu hình.');
      error.statusCode = 404;
      throw error;
    }
  }
  const normalized = normalizeSettings(payload, data.global);
  await ensureSchema();
  await archiveCurrentScope(scopeCode, payload?.change_reason, userId);
  await db.promise().query(`
    INSERT INTO production_formula_settings (
      scope_code, process_id, effective_from, effective_to, apply_training_percent, output_formula,
      output_per_hour_formula, achievement_formula, ng_rate_formula,
      actual_time_formula, threshold_red, threshold_orange,
      threshold_yellow, threshold_green, version_no, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON DUPLICATE KEY UPDATE
      process_id=VALUES(process_id),
      effective_from=VALUES(effective_from),
      effective_to=VALUES(effective_to),
      apply_training_percent=VALUES(apply_training_percent),
      output_formula=VALUES(output_formula),
      output_per_hour_formula=VALUES(output_per_hour_formula),
      achievement_formula=VALUES(achievement_formula),
      ng_rate_formula=VALUES(ng_rate_formula),
      actual_time_formula=VALUES(actual_time_formula),
      threshold_red=VALUES(threshold_red),
      threshold_orange=VALUES(threshold_orange),
      threshold_yellow=VALUES(threshold_yellow),
      threshold_green=VALUES(threshold_green),
      version_no=version_no+1,
      updated_by=VALUES(updated_by)
  `, [
    scopeCode,
    process ? Number(process.id) : null,
    normalized.effective_from,
    normalized.effective_to,
    normalized.apply_training_percent,
    normalized.output_formula,
    normalized.output_per_hour_formula,
    normalized.achievement_formula,
    normalized.ng_rate_formula,
    normalized.actual_time_formula,
    normalized.threshold_red,
    normalized.threshold_orange,
    normalized.threshold_yellow,
    normalized.threshold_green,
    Number(userId) || null
  ]);
  await AuditService.logActivity({
    userId,
    action: 'FORMULA_UPDATED',
    entityType: 'formula_setting',
    entityId: scopeCode,
    description: `Cập nhật công thức ${scopeCode}`,
    metadata: {
      scope_code: scopeCode,
      process_id: process ? Number(process.id) : null,
      effective_from: normalized.effective_from,
      effective_to: normalized.effective_to,
      change_reason: String(payload?.change_reason || '').trim() || null
    }
  });
  cache = null;
  return loadAll({ force: true });
}

async function resetScope(scopeCode, userId = null) {
  await ensureSchema();
  await archiveCurrentScope(scopeCode, 'Khôi phục cấu hình mặc định', userId);
  if (scopeCode === 'GLOBAL') {
    await db.promise().query(`DELETE FROM production_formula_settings WHERE scope_code='GLOBAL'`);
    await db.promise().query(`INSERT INTO production_formula_settings (scope_code, process_id) VALUES ('GLOBAL', NULL)`);
  } else {
    await db.promise().query(`DELETE FROM production_formula_settings WHERE scope_code=?`, [scopeCode]);
  }
  await AuditService.logActivity({
    userId,
    action: 'FORMULA_RESET',
    entityType: 'formula_setting',
    entityId: scopeCode,
    description: `Khôi phục công thức mặc định ${scopeCode}`
  });
  cache = null;
  return loadAll({ force: true });
}

module.exports = {
  DEFAULT_SETTINGS,
  ensureSchema,
  loadAll,
  getSettingsMap,
  saveScope,
  resetScope,
  normalizeSettings,
  isEffective
};
