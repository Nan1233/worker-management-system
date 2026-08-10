const db = require('../config/db');

let readyPromise = null;

async function ensureSchema() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const statements = [
      `CREATE TABLE IF NOT EXISTS reporting_period_locks (
        id BIGINT NOT NULL AUTO_INCREMENT,
        report_year INT NOT NULL,
        report_month INT NOT NULL,
        process_id BIGINT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'locked',
        reason VARCHAR(500) NULL,
        locked_by BIGINT NULL,
        locked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        unlocked_by BIGINT NULL,
        unlocked_at TIMESTAMP NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_reporting_period_lock (report_year, report_month, process_id),
        KEY idx_reporting_period_status (status, report_year, report_month),
        KEY idx_reporting_period_process (process_id)
      )`,
      `CREATE TABLE IF NOT EXISTS production_plans (
        id BIGINT NOT NULL AUTO_INCREMENT,
        plan_date DATE NOT NULL,
        shift VARCHAR(20) NULL,
        process_id BIGINT NOT NULL,
        machine_id BIGINT NULL,
        product_code VARCHAR(120) NOT NULL,
        planned_quantity DECIMAL(18,3) NOT NULL DEFAULT 0,
        planned_minutes DECIMAL(12,3) NOT NULL DEFAULT 0,
        planned_workers DECIMAL(10,2) NOT NULL DEFAULT 0,
        priority INT NOT NULL DEFAULT 0,
        status VARCHAR(30) NOT NULL DEFAULT 'draft',
        note VARCHAR(500) NULL,
        created_by BIGINT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_production_plans_date (plan_date, process_id),
        KEY idx_production_plans_status (status, plan_date)
      )`,
      `CREATE TABLE IF NOT EXISTS report_validation_results (
        id BIGINT NOT NULL AUTO_INCREMENT,
        report_type VARCHAR(20) NOT NULL DEFAULT 'approved',
        report_id BIGINT NOT NULL,
        rule_code VARCHAR(80) NOT NULL,
        severity VARCHAR(20) NOT NULL DEFAULT 'warning',
        message VARCHAR(500) NOT NULL,
        details_json JSON NULL,
        resolved TINYINT(1) NOT NULL DEFAULT 0,
        resolved_by BIGINT NULL,
        resolved_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_validation_open (resolved, severity, created_at),
        KEY idx_validation_report (report_type, report_id)
      )`,
      `CREATE TABLE IF NOT EXISTS product_standard_versions (
        id BIGINT NOT NULL AUTO_INCREMENT,
        process_id BIGINT NOT NULL,
        product_code VARCHAR(120) NOT NULL,
        standard_output DECIMAL(18,6) NOT NULL DEFAULT 0,
        exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
        version_no INT NOT NULL DEFAULT 1,
        effective_from DATE NOT NULL,
        effective_to DATE NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_by BIGINT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_standard_version_lookup (process_id, product_code, effective_from, effective_to),
        KEY idx_standard_version_status (status, effective_from)
      )`,
      `CREATE TABLE IF NOT EXISTS production_report_snapshots (
        id BIGINT NOT NULL AUTO_INCREMENT,
        report_id BIGINT NOT NULL,
        snapshot_type VARCHAR(30) NOT NULL,
        standard_version_id BIGINT NULL,
        calculation_version VARCHAR(40) NULL,
        snapshot_data JSON NOT NULL,
        created_by BIGINT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_report_snapshot (report_id, snapshot_type),
        KEY idx_report_snapshot_created (created_at)
      )`
    ];

    for (const sql of statements) {
      await db.promise().query(sql);
    }
  })().catch((error) => {
    readyPromise = null;
    throw error;
  });

  return readyPromise;
}

module.exports = { ensureSchema };
