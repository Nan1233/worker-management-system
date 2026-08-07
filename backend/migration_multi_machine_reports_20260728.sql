-- Chi tiết tối đa 4 máy cho báo cáo công đoạn Cắt/Lồng.
-- Chạy một lần trên TiDB trước khi deploy backend mới.

CREATE TABLE IF NOT EXISTS production_temp_machine_lines (
    id BIGINT NOT NULL AUTO_INCREMENT,
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
    PRIMARY KEY (id),
    UNIQUE KEY uq_temp_report_machine (temp_report_id, machine_code),
    KEY idx_temp_machine_report (temp_report_id)
);

CREATE TABLE IF NOT EXISTS production_report_machine_lines (
    id BIGINT NOT NULL AUTO_INCREMENT,
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
    PRIMARY KEY (id),
    UNIQUE KEY uq_report_machine (report_id, machine_code),
    KEY idx_machine_report (report_id)
);
