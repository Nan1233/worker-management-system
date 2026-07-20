-- Chạy một lần trên database hiện tại.
ALTER TABLE production_reports_temp
    ADD COLUMN client_request_id VARCHAR(64) NULL AFTER note;

CREATE UNIQUE INDEX uq_temp_worker_request
    ON production_reports_temp(worker_id, client_request_id);

CREATE TABLE IF NOT EXISTS integration_sync_jobs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    job_type ENUM('google_sheet','monthly_excel') NOT NULL,
    job_key VARCHAR(100) NOT NULL,
    work_date DATE NULL,
    report_month CHAR(7) NULL,
    process_id INT NULL,
    status ENUM('pending','processing','success','failed') NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 8,
    next_retry_at DATETIME NULL,
    locked_at DATETIME NULL,
    last_error TEXT NULL,
    result_url TEXT NULL,
    completed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sync_job (job_type, job_key),
    KEY idx_sync_ready (status, next_retry_at),
    KEY idx_sync_month (report_month, process_id)
);
