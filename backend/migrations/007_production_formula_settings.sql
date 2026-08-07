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
);
INSERT IGNORE INTO production_formula_settings (scope_code, process_id) VALUES ('GLOBAL', NULL);
