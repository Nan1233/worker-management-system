'use strict';

const bcrypt = require('bcrypt');
const db = require('../config/db');
const snapshot = require('../data/mau-goc-ktc.json');

const SEED_KEY = 'KTC_MAU_GOC_V1';
const BATCH_SIZE = Math.max(50, Math.min(500, Number(process.env.KTC_SEED_BATCH_SIZE || 200)));
const q = () => db.promise();

function log(message) {
  console.log(`[KTC][SEED] ${message}`);
}

function chunks(items, size = BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function tableExists(name) {
  const [rows] = await q().query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1',
    [name]
  );
  return rows.length > 0;
}

async function columnExists(table, column) {
  const [rows] = await q().query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}

async function ensureMasterSeedSupport() {
  log('Kiểm tra các bảng hỗ trợ seed...');
  await q().query(`
    CREATE TABLE IF NOT EXISTS master_seed_runs (
      seed_key VARCHAR(120) NOT NULL PRIMARY KEY,
      source_file VARCHAR(255) NOT NULL,
      source_sha256 CHAR(64) NOT NULL,
      summary_json JSON NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await q().query(`
    CREATE TABLE IF NOT EXISTS product_aliases (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      process_id BIGINT NOT NULL,
      alias_code VARCHAR(160) NOT NULL,
      product_code VARCHAR(160) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_product_alias (process_id, alias_code),
      KEY idx_product_alias_product (process_id, product_code)
    )
  `);
  await q().query(`
    CREATE TABLE IF NOT EXISTS product_standard_variants (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      process_id BIGINT NOT NULL,
      work_type VARCHAR(180) NOT NULL DEFAULT '',
      product_code VARCHAR(180) NOT NULL,
      standard_output DECIMAL(18,6) NOT NULL,
      exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
      source_sheet VARCHAR(120) NULL,
      source_row INT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_standard_variant (process_id, work_type, product_code),
      KEY idx_standard_variant_product (process_id, product_code)
    )
  `);
  log('Bảng hỗ trợ seed: OK');
}

async function ensureDecimalStandard() {
  if (!await tableExists('product_standards')) return;
  const [rows] = await q().query(
    `SELECT DATA_TYPE, NUMERIC_SCALE FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='product_standards' AND column_name='standard_output' LIMIT 1`
  );
  if (!rows.length) return;
  const type = String(rows[0].DATA_TYPE || '').toLowerCase();
  const scale = Number(rows[0].NUMERIC_SCALE || 0);
  if (!['decimal', 'double', 'float'].includes(type) || scale === 0) {
    log('Chuyển product_standards.standard_output sang DECIMAL(18,6)...');
    await q().query('ALTER TABLE product_standards MODIFY COLUMN standard_output DECIMAL(18,6) NOT NULL');
  }
}

function placeholders(rowCount, colCount) {
  return Array.from({ length: rowCount }, () => `(${Array(colCount).fill('?').join(',')})`).join(',');
}

async function upsertProcesses(connection) {
  log(`Công đoạn: đồng bộ ${snapshot.processes.length} dòng...`);
  for (const item of snapshot.processes) {
    await connection.query(
      `INSERT INTO processes (process_code, process_name, description, status)
       VALUES (?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE process_name=VALUES(process_name), description=VALUES(description), status='active'`,
      [item.process_code, item.process_name, item.description || null]
    );
  }
  const [rows] = await connection.query('SELECT id, UPPER(TRIM(process_code)) AS process_code FROM processes');
  const ids = Object.fromEntries(rows.map((r) => [String(r.process_code).toUpperCase(), Number(r.id)]));
  const missing = snapshot.processes.filter((x) => !ids[String(x.process_code).toUpperCase()]).map((x) => x.process_code);
  if (missing.length) throw new Error(`Không tạo được công đoạn: ${missing.join(', ')}`);
  log(`Công đoạn: OK (${snapshot.processes.length}/9 từ mẫu)`);
  return ids;
}

async function upsertMachines(connection, processIds) {
  if (!await tableExists('machines')) return 0;
  const rows = snapshot.machines
    .map((item) => ({ ...item, processId: processIds[String(item.process_code).toUpperCase()] }))
    .filter((item) => item.processId);
  log(`Máy: đồng bộ ${rows.length} dòng...`);
  for (const batch of chunks(rows)) {
    const values = [];
    for (const item of batch) values.push(item.processId, item.machine_code, item.machine_name, 'active');
    await connection.query(
      `INSERT INTO machines (process_id, machine_code, machine_name, status)
       VALUES ${placeholders(batch.length, 4)}
       ON DUPLICATE KEY UPDATE machine_name=VALUES(machine_name), status='active'`, values
    );
  }
  log(`Máy: OK (${rows.length})`);
  return rows.length;
}

async function applyFactoryMachinePolicies(connection) {
  const hasAuto = await columnExists('machines', 'is_automatic');
  const hasMaxWorkers = await columnExists('machines', 'max_workers_per_machine');
  const hasOutputBasis = await columnExists('machines', 'output_basis');
  if (!hasAuto || !hasMaxWorkers || !hasOutputBasis) return;

  const autoNumbers = [1,2,10,11,4,3,9,8,25,26,14,17,23,24,16];
  const sharedNumbers = [5,6,7,11];
  const aliasesFor = (n) => {
    const pad = n < 10 ? String(n).padStart(2, '0') : String(n);
    return [...new Set([String(n), pad, `M${n}`, `M${pad}`, `MAY${n}`, `MAY${pad}`, `MAY-${n}`, `MACHINE${n}`, `MACHINE-${n}`])];
  };
  const autoCodes = autoNumbers.flatMap(aliasesFor);
  const sharedCodes = sharedNumbers.flatMap(aliasesFor);
  const normalizeExpr = "UPPER(REPLACE(REPLACE(TRIM(m.machine_code),' ',''),'MÁY','MAY'))";

  await connection.query(
    `UPDATE machines m JOIN processes p ON p.id=m.process_id
        SET m.is_automatic=1
      WHERE p.process_code='GC' AND ${normalizeExpr} IN (${autoCodes.map(() => '?').join(',')})`, autoCodes
  );
  await connection.query(
    `UPDATE machines m JOIN processes p ON p.id=m.process_id
        SET m.max_workers_per_machine=2, m.output_basis='MACHINE'
      WHERE p.process_code='GC' AND ${normalizeExpr} IN (${sharedCodes.map(() => '?').join(',')})`, sharedCodes
  );
  await connection.query(
    `UPDATE machines m JOIN processes p ON p.id=m.process_id
        SET m.max_workers_per_machine=1
      WHERE p.process_code IN ('DO','EP','K1','K2','CAN')`
  );
  log('Quy tắc máy thực tế xưởng: OK');
}

async function upsertAliases(connection, processIds) {
  const rows = snapshot.product_aliases
    .map((item) => ({ ...item, processId: processIds[String(item.process_code).toUpperCase()] }))
    .filter((item) => item.processId);
  log(`Ánh xạ sản phẩm: đồng bộ ${rows.length} dòng...`);
  for (const batch of chunks(rows)) {
    const values = [];
    for (const item of batch) values.push(item.processId, item.alias_code, item.product_code, 'active');
    await connection.query(
      `INSERT INTO product_aliases (process_id, alias_code, product_code, status)
       VALUES ${placeholders(batch.length, 4)}
       ON DUPLICATE KEY UPDATE product_code=VALUES(product_code), status='active'`, values
    );
  }
  log(`Ánh xạ sản phẩm: OK (${rows.length})`);
  return rows.length;
}

async function upsertStandards(connection, processIds) {
  const hasCanonical = await tableExists('product_standards');
  const hasWorkType = hasCanonical && await columnExists('product_standards', 'work_type');
  const hasExclude = hasCanonical && await columnExists('product_standards', 'exclude_kqd_from_tt');
  const rows = snapshot.product_standards
    .map((item) => ({ ...item, processId: processIds[String(item.process_code).toUpperCase()] }))
    .filter((item) => item.processId && Number.isFinite(Number(item.standard_output)) && Number(item.standard_output) > 0);

  log(`Định mức biến thể: đồng bộ ${rows.length} dòng...`);
  for (const batch of chunks(rows)) {
    const values = [];
    for (const item of batch) {
      values.push(item.processId, item.work_type || '', item.product_code, Number(item.standard_output), Number(item.exclude_kqd_from_tt || 0), item.source_sheet || null, item.source_row || null, 'active');
    }
    await connection.query(
      `INSERT INTO product_standard_variants
       (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
       VALUES ${placeholders(batch.length, 8)}
       ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt),
       source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active'`, values
    );
  }

  const canonical = new Map();
  for (const item of rows) {
    const key = `${item.processId}|${String(item.product_code).trim().toUpperCase()}`;
    if (!canonical.has(key)) canonical.set(key, item);
  }

  if (hasCanonical && canonical.size) {
    const canonicalRows = [...canonical.values()];
    log(`Định mức đang dùng: đồng bộ ${canonicalRows.length} mã chuẩn...`);
    for (const batch of chunks(canonicalRows)) {
      const values = [];
      let sql;
      if (hasWorkType && hasExclude) {
        for (const item of batch) values.push(item.processId, item.work_type || '', item.product_code, Number(item.standard_output), Number(item.exclude_kqd_from_tt || 0), 'active');
        sql = `INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
               VALUES ${placeholders(batch.length, 6)}
               ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active'`;
      } else if (hasExclude) {
        for (const item of batch) values.push(item.processId, item.product_code, Number(item.standard_output), Number(item.exclude_kqd_from_tt || 0), 'active');
        sql = `INSERT INTO product_standards (process_id, product_code, standard_output, exclude_kqd_from_tt, status)
               VALUES ${placeholders(batch.length, 5)}
               ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active'`;
      } else {
        for (const item of batch) values.push(item.processId, item.product_code, Number(item.standard_output), 'active');
        sql = `INSERT INTO product_standards (process_id, product_code, standard_output, status)
               VALUES ${placeholders(batch.length, 4)}
               ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), status='active'`;
      }
      await connection.query(sql, values);
    }
  }
  log(`Định mức: OK (biến thể ${rows.length}; chuẩn ${canonical.size})`);
  return { variants: rows.length, canonical: canonical.size };
}

async function upsertCatalog(connection, processIds, table, rows, codeField, nameField, label) {
  if (!await tableExists(table)) return 0;
  const mapped = rows
    .map((item) => ({ ...item, processId: processIds[String(item.process_code).toUpperCase()] }))
    .filter((item) => item.processId);
  log(`${label}: đồng bộ ${mapped.length} dòng...`);
  for (const batch of chunks(mapped)) {
    const values = [];
    for (const item of batch) values.push(item.processId, item[codeField], item[nameField], Number(item.sort_order || 0), 'active');
    await connection.query(
      `INSERT INTO ${table} (process_id, ${codeField}, ${nameField}, sort_order, status)
       VALUES ${placeholders(batch.length, 5)}
       ON DUPLICATE KEY UPDATE ${nameField}=VALUES(${nameField}), sort_order=VALUES(sort_order), status='active'`, values
    );
  }
  log(`${label}: OK (${mapped.length})`);
  return mapped.length;
}

async function getIdsByValues(connection, table, idField, keyField, values) {
  const map = new Map();
  for (const batch of chunks([...new Set(values.map((x) => String(x)))])) {
    if (!batch.length) continue;
    const [rows] = await connection.query(
      `SELECT ${idField} AS id, ${keyField} AS k FROM ${table} WHERE ${keyField} IN (${batch.map(() => '?').join(',')})`,
      batch
    );
    for (const row of rows) map.set(String(row.k), Number(row.id));
  }
  return map;
}

async function upsertWorkers(connection, processIds) {
  if (!await tableExists('users') || !await tableExists('workers')) return { workers: 0, assignments: 0 };
  const defaultPassword = String(process.env.KTC_SEED_DEFAULT_PASSWORD || '123456');
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  const rows = snapshot.workers.filter((item) => String(item.worker_code || '').trim());
  log(`Công nhân: đồng bộ ${rows.length} người...`);

  for (const batch of chunks(rows)) {
    const values = [];
    for (const item of batch) values.push(String(item.worker_code).trim(), passwordHash, item.full_name, 'worker', 'active');
    await connection.query(
      `INSERT INTO users (username, password, full_name, role, status)
       VALUES ${placeholders(batch.length, 5)}
       ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), status='active'`, values
    );
  }

  const usernames = rows.map((item) => String(item.worker_code).trim());
  const userIds = await getIdsByValues(connection, 'users', 'id', 'username', usernames);

  const workerRows = rows
    .map((item) => ({ ...item, username: String(item.worker_code).trim(), userId: userIds.get(String(item.worker_code).trim()) }))
    .filter((item) => item.userId);

  for (const batch of chunks(workerRows)) {
    const values = [];
    for (const item of batch) values.push(item.userId, item.worker_code, 'Sản xuất', 'Công nhân', Number(item.training_percent ?? 100), 'active');
    await connection.query(
      `INSERT INTO workers (user_id, worker_code, department, position, training_percent, status)
       VALUES ${placeholders(batch.length, 6)}
       ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), training_percent=VALUES(training_percent), status='active'`, values
    );
  }

  const workerIds = await getIdsByValues(connection, 'workers', 'id', 'worker_code', workerRows.map((x) => x.worker_code));
  let assignmentCount = 0;
  if (await tableExists('worker_processes')) {
    const assignments = [];
    const seen = new Set();
    for (const item of workerRows) {
      const workerId = workerIds.get(String(item.worker_code));
      if (!workerId) continue;
      for (const code of item.process_codes || []) {
        const processId = processIds[String(code).toUpperCase()];
        if (!processId) continue;
        const key = `${workerId}|${processId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        assignments.push([workerId, processId]);
      }
    }
    for (const batch of chunks(assignments)) {
      const values = batch.flat();
      await connection.query(
        `INSERT IGNORE INTO worker_processes (worker_id, process_id) VALUES ${placeholders(batch.length, 2)}`,
        values
      );
    }
    assignmentCount = assignments.length;
  }
  log(`Công nhân: OK (${workerIds.size}); phân công từ mẫu ${assignmentCount}`);
  return { workers: workerIds.size, assignments: assignmentCount };
}

async function upsertFormulaSettings(connection) {
  if (!await tableExists('production_formula_settings')) return 0;
  const s = snapshot.formula_settings;
  log('Công thức: đồng bộ cấu hình chung...');
  await connection.query(
    `INSERT INTO production_formula_settings
     (scope_code, process_id, apply_training_percent, output_formula, output_per_hour_formula, achievement_formula,
      ng_rate_formula, actual_time_formula, threshold_red, threshold_orange, threshold_yellow, threshold_green)
     VALUES ('GLOBAL', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE apply_training_percent=VALUES(apply_training_percent), output_formula=VALUES(output_formula),
     output_per_hour_formula=VALUES(output_per_hour_formula), achievement_formula=VALUES(achievement_formula),
     ng_rate_formula=VALUES(ng_rate_formula), actual_time_formula=VALUES(actual_time_formula),
     threshold_red=VALUES(threshold_red), threshold_orange=VALUES(threshold_orange),
     threshold_yellow=VALUES(threshold_yellow), threshold_green=VALUES(threshold_green)`,
    [s.apply_training_percent, s.output_formula, s.output_per_hour_formula, s.achievement_formula,
      s.ng_rate_formula, s.actual_time_formula, s.threshold_red, s.threshold_orange, s.threshold_yellow, s.threshold_green]
  );
  log('Công thức: OK');
  return 1;
}

async function runMasterSeed({ closePool = true } = {}) {
  log(`Bắt đầu seed dữ liệu mẫu; batch=${BATCH_SIZE}`);
  const database = await db.testConnection();
  log(`Đã kết nối DB${database?.host ? ` ${database.host}` : ''}`);
  await ensureMasterSeedSupport();
  await ensureDecimalStandard();
  const connection = await q().getConnection();
  try {
    await connection.beginTransaction();
    const processIds = await upsertProcesses(connection);
    const machines = await upsertMachines(connection, processIds);
    await applyFactoryMachinePolicies(connection);
    const aliases = await upsertAliases(connection, processIds);
    const standards = await upsertStandards(connection, processIds);
    const deductions = await upsertCatalog(connection, processIds, 'deduction_types', snapshot.deduction_types, 'deduction_code', 'deduction_name', 'Trừ giờ');
    const defects = await upsertCatalog(connection, processIds, 'defect_types', snapshot.defect_types, 'defect_code', 'defect_name', 'Lỗi NG');
    const workers = await upsertWorkers(connection, processIds);
    const formulaSettings = await upsertFormulaSettings(connection);
    const summary = {
      processes: snapshot.processes.length,
      machines,
      aliases,
      ...standards,
      deductions,
      defects,
      ...workers,
      formulaSettings
    };

    await connection.query(
      `INSERT INTO master_seed_runs (seed_key, source_file, source_sha256, summary_json)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE source_file=VALUES(source_file), source_sha256=VALUES(source_sha256), summary_json=VALUES(summary_json), updated_at=CURRENT_TIMESTAMP`,
      [SEED_KEY, snapshot.meta.nguon, snapshot.meta.sha256, JSON.stringify(summary)]
    );
    await connection.commit();
    log('COMMIT thành công');
    console.log('[KTC] MASTER SEED OK', summary);
    return summary;
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    console.error('[KTC][SEED] Đã rollback vì lỗi:', error.message);
    throw error;
  } finally {
    connection.release();
    if (closePool) await db.closePool().catch(() => undefined);
  }
}

if (require.main === module) {
  runMasterSeed().catch((error) => {
    console.error('[KTC] MASTER SEED FAILED:', error);
    process.exitCode = 1;
  });
}

module.exports = { runMasterSeed };
