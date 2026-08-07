const db = require('../config/db');

const DEFAULT_SETTINGS = Object.freeze({
  scope_code: 'GLOBAL',
  process_id: null,
  process_code: null,
  process_name: 'Áp dụng chung',
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

let schemaReadyPromise = null;
let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 15_000;

async function ensureSchema() {
  if (schemaReadyPromise) return schemaReadyPromise;
  schemaReadyPromise = db.promise().query(`
    CREATE TABLE IF NOT EXISTS production_formula_settings (
      scope_code VARCHAR(30) NOT NULL,
      process_id BIGINT NULL,
      apply_training_percent TINYINT(1) NOT NULL DEFAULT 1,
      output_formula VARCHAR(50) NOT NULL DEFAULT 'ENTERED_X_TRAINING',
      output_per_hour_formula VARCHAR(60) NOT NULL DEFAULT 'ADJUSTED_OUTPUT_DIV_ACTUAL_TIME',
      achievement_formula VARCHAR(60) NOT NULL DEFAULT 'OUTPUT_PER_HOUR_DIV_STANDARD',
      ng_rate_formula VARCHAR(50) NOT NULL DEFAULT 'NG_DIV_OK_PLUS_NG',
      actual_time_formula VARCHAR(40) NOT NULL DEFAULT 'DATABASE_SNAPSHOT',
      threshold_red DECIMAL(7,2) NOT NULL DEFAULT 80,
      threshold_orange DECIMAL(7,2) NOT NULL DEFAULT 95,
      threshold_yellow DECIMAL(7,2) NOT NULL DEFAULT 100,
      threshold_green DECIMAL(7,2) NOT NULL DEFAULT 110,
      version_no INT NOT NULL DEFAULT 1,
      updated_by BIGINT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (scope_code),
      KEY idx_formula_process_id (process_id)
    )
  `).then(async () => {
    await db.promise().query(
      `INSERT IGNORE INTO production_formula_settings (scope_code, process_id) VALUES ('GLOBAL', NULL)`
    );
  }).catch((error) => {
    schemaReadyPromise = null;
    throw error;
  });
  return schemaReadyPromise;
}

function normalizePercent(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1000, Math.max(0, number));
}

function normalizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const result = {
    ...base,
    ...input,
    apply_training_percent: input.apply_training_percent === false || Number(input.apply_training_percent) === 0 ? 0 : 1,
    threshold_red: normalizePercent(input.threshold_red, Number(base.threshold_red)),
    threshold_orange: normalizePercent(input.threshold_orange, Number(base.threshold_orange)),
    threshold_yellow: normalizePercent(input.threshold_yellow, Number(base.threshold_yellow)),
    threshold_green: normalizePercent(input.threshold_green, Number(base.threshold_green))
  };
  if (!(result.threshold_red < result.threshold_orange && result.threshold_orange < result.threshold_yellow && result.threshold_yellow < result.threshold_green)) {
    const error = new Error('Ngưỡng màu phải tăng dần: đỏ < cam < vàng < xanh.');
    error.statusCode = 400;
    throw error;
  }
  return result;
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
  const [settingRows] = await db.promise().query(`
    SELECT scope_code, process_id, apply_training_percent, output_formula,
           output_per_hour_formula, achievement_formula, ng_rate_formula,
           actual_time_formula, threshold_red, threshold_orange,
           threshold_yellow, threshold_green, version_no, updated_at
    FROM production_formula_settings
  `);
  const byScope = new Map(settingRows.map((row) => [String(row.scope_code), row]));
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
  cache = { global, scopes, processes: processRows };
  cacheAt = Date.now();
  return cache;
}

async function getSettingsMap() {
  const data = await loadAll();
  const map = { GLOBAL: data.global };
  for (const scope of data.scopes) {
    if (scope.process_code) map[String(scope.process_code).toUpperCase()] = scope;
  }
  return map;
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
  await db.promise().query(`
    INSERT INTO production_formula_settings (
      scope_code, process_id, apply_training_percent, output_formula,
      output_per_hour_formula, achievement_formula, ng_rate_formula,
      actual_time_formula, threshold_red, threshold_orange,
      threshold_yellow, threshold_green, version_no, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON DUPLICATE KEY UPDATE
      process_id=VALUES(process_id),
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
  cache = null;
  return loadAll({ force: true });
}

async function resetScope(scopeCode) {
  if (scopeCode === 'GLOBAL') {
    await db.promise().query(`DELETE FROM production_formula_settings WHERE scope_code='GLOBAL'`);
    await db.promise().query(`INSERT INTO production_formula_settings (scope_code, process_id) VALUES ('GLOBAL', NULL)`);
  } else {
    await db.promise().query(`DELETE FROM production_formula_settings WHERE scope_code=?`, [scopeCode]);
  }
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
  normalizeSettings
};
