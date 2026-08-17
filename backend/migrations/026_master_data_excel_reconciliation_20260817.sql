-- KTC 026 - Đồng bộ master data đầy đủ từ file mẫu.xlsx (SHA-256 0aab63bffa213f335d06326231baa9a395455ab73d1aa19e0ef37182984704a4).
-- Migration này chỉ tạo hạ tầng lưu nguồn/reconciliation; dữ liệu được upsert idempotent bởi:
--   npm run db:seed-master
-- Không xóa production reports/history.

CREATE TABLE IF NOT EXISTS master_personnel_source (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_sha256 CHAR(64) NOT NULL,
  process_code VARCHAR(40) NOT NULL,
  source_worker_code VARCHAR(120) NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  source_row INT NOT NULL,
  resolution_status VARCHAR(30) NOT NULL DEFAULT 'resolved',
  canonical_worker_code VARCHAR(120) NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_master_personnel_source (source_sha256, process_code, source_worker_code, source_row),
  KEY idx_master_personnel_source_code (source_worker_code, process_code),
  KEY idx_master_personnel_resolution (resolution_status)
);

CREATE TABLE IF NOT EXISTS worker_code_aliases (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  alias_code VARCHAR(120) NOT NULL,
  worker_id BIGINT NOT NULL,
  source_process_code VARCHAR(120) NULL,
  source_name VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_worker_code_alias (alias_code),
  KEY idx_worker_code_alias_worker (worker_id, status)
);

CREATE TABLE IF NOT EXISTS master_product_source (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_sha256 CHAR(64) NOT NULL,
  process_code VARCHAR(40) NOT NULL,
  source_group VARCHAR(60) NOT NULL,
  alias_code VARCHAR(180) NOT NULL,
  product_code VARCHAR(180) NOT NULL,
  source_row INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_master_product_source (source_sha256, process_code, source_group, alias_code, product_code, source_row),
  KEY idx_master_product_source_lookup (process_code, product_code)
);
