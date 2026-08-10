-- Hạ tầng seed dữ liệu gốc KTC từ file mẫu.
CREATE TABLE IF NOT EXISTS master_seed_runs (
  seed_key VARCHAR(120) NOT NULL PRIMARY KEY,
  source_file VARCHAR(255) NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  summary_json JSON NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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
);

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
);
