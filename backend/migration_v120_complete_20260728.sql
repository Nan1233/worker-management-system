-- KTC v1.2.0: Cắt/Lồng, Tay/Máy, nhiều máy, audit/notification indexes.
-- BACKUP DB trước khi chạy. Script an toàn, không xóa dữ liệu cũ.

ALTER TABLE machines ADD COLUMN IF NOT EXISTS operation_type VARCHAR(10) NULL COMMENT 'CUT hoặc NEST';
ALTER TABLE production_reports_temp ADD COLUMN IF NOT EXISTS operation_type VARCHAR(10) NULL;
ALTER TABLE production_reports_temp ADD COLUMN IF NOT EXISTS operation_mode VARCHAR(10) NULL;
ALTER TABLE production_reports ADD COLUMN IF NOT EXISTS operation_type VARCHAR(10) NULL;
ALTER TABLE production_reports ADD COLUMN IF NOT EXISTS operation_mode VARCHAR(10) NULL;

CREATE TABLE IF NOT EXISTS product_operation_rules (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  process_id BIGINT NOT NULL,
  product_standard_id BIGINT NOT NULL,
  operation_type VARCHAR(10) NOT NULL,
  operation_mode VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_operation(product_standard_id, operation_type, operation_mode),
  KEY idx_por_filter(process_id, operation_type, operation_mode, status)
);

CREATE TABLE IF NOT EXISTS product_machine_rules (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_standard_id BIGINT NOT NULL,
  machine_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_machine(product_standard_id, machine_id),
  KEY idx_pmr_machine(machine_id, status)
);

CREATE TABLE IF NOT EXISTS production_temp_machine_lines (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  temp_report_id BIGINT NOT NULL,
  machine_id BIGINT NULL,
  machine_code VARCHAR(100) NOT NULL,
  product_standard_id BIGINT NULL,
  product_code VARCHAR(255) NOT NULL,
  machine_time_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  standard_output DECIMAL(14,2) NOT NULL DEFAULT 0,
  ok_quantity BIGINT NOT NULL DEFAULT 0,
  ng_quantity BIGINT NOT NULL DEFAULT 0,
  maximum_output DECIMAL(16,2) NOT NULL DEFAULT 0,
  sort_order TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_temp_report_machine(temp_report_id, machine_code),
  KEY idx_temp_machine_report(temp_report_id)
);

CREATE TABLE IF NOT EXISTS production_report_machine_lines (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  report_id BIGINT NOT NULL,
  machine_id BIGINT NULL,
  machine_code VARCHAR(100) NOT NULL,
  product_standard_id BIGINT NULL,
  product_code VARCHAR(255) NOT NULL,
  machine_time_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  standard_output DECIMAL(14,2) NOT NULL DEFAULT 0,
  ok_quantity BIGINT NOT NULL DEFAULT 0,
  ng_quantity BIGINT NOT NULL DEFAULT 0,
  maximum_output DECIMAL(16,2) NOT NULL DEFAULT 0,
  sort_order TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_report_machine(report_id, machine_code),
  KEY idx_machine_report(report_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_type, entity_id, created_at);
