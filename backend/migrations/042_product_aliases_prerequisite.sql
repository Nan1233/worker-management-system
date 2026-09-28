-- KTC 042: prerequisite schema for product aliases.
-- Must run before 047_gc_aliases_from_excel_20260924.sql.
-- Idempotent: safe for existing databases.
CREATE TABLE IF NOT EXISTS product_aliases (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  alias_code VARCHAR(180) NOT NULL,
  product_code VARCHAR(180) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_alias_process_alias (process_id, alias_code),
  KEY idx_product_alias_lookup (process_id, product_code, status)
);
