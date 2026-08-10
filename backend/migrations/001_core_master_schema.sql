-- KTC 001: Khởi tạo các bảng master lõi. An toàn khi chạy trên DB đã có dữ liệu.
CREATE TABLE IF NOT EXISTS users (
  id BIGINT NOT NULL AUTO_INCREMENT,
  username VARCHAR(120) NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'worker',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_role_status (role, status)
);

CREATE TABLE IF NOT EXISTS processes (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_code VARCHAR(50) NOT NULL,
  process_name VARCHAR(180) NOT NULL,
  description VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_process_code (process_code),
  KEY idx_process_status (status, process_name)
);

CREATE TABLE IF NOT EXISTS workers (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  worker_code VARCHAR(100) NOT NULL,
  phone VARCHAR(40) NULL,
  department VARCHAR(120) NULL DEFAULT 'Sản xuất',
  position VARCHAR(120) NULL DEFAULT 'Công nhân',
  training_percent DECIMAL(7,2) NOT NULL DEFAULT 100,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_workers_user (user_id),
  UNIQUE KEY uq_workers_code (worker_code),
  KEY idx_workers_status_code (status, worker_code)
);

CREATE TABLE IF NOT EXISTS worker_processes (
  worker_id BIGINT NOT NULL,
  process_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (worker_id, process_id),
  KEY idx_worker_process_process (process_id, worker_id)
);

CREATE TABLE IF NOT EXISTS manager_processes (
  manager_id BIGINT NOT NULL,
  process_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (manager_id, process_id),
  KEY idx_manager_process_process (process_id, manager_id)
);

CREATE TABLE IF NOT EXISTS machines (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  machine_code VARCHAR(120) NOT NULL,
  machine_name VARCHAR(255) NOT NULL,
  exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_machine_process_code (process_id, machine_code),
  KEY idx_machine_process_status (process_id, status)
);

CREATE TABLE IF NOT EXISTS product_standards (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  work_type VARCHAR(180) NOT NULL DEFAULT '',
  product_code VARCHAR(180) NOT NULL,
  standard_output DECIMAL(18,6) NOT NULL,
  exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_standard (process_id, product_code),
  KEY idx_product_standard_status (process_id, status, product_code)
);

CREATE TABLE IF NOT EXISTS product_machine_standards (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  product_code VARCHAR(180) NOT NULL,
  machine_id BIGINT NOT NULL,
  standard_output DECIMAL(18,6) NOT NULL,
  standard_time_seconds DECIMAL(18,6) NULL,
  calculated_output_per_hour DECIMAL(18,6) NULL,
  source_name VARCHAR(120) NULL,
  source_row_number INT NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_machine_standard (process_id, product_code, machine_id, effective_from),
  KEY idx_product_machine_active (process_id, product_code, machine_id, is_active)
);

CREATE TABLE IF NOT EXISTS defect_types (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  defect_code VARCHAR(100) NOT NULL,
  defect_name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_defect_process_code (process_id, defect_code),
  KEY idx_defect_process_status (process_id, status, sort_order)
);

CREATE TABLE IF NOT EXISTS deduction_types (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  deduction_code VARCHAR(100) NOT NULL,
  deduction_name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_deduction_process_code (process_id, deduction_code),
  KEY idx_deduction_process_status (process_id, status, sort_order)
);
