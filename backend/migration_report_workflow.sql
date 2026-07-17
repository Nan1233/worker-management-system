-- =====================================================
-- MIGRATION: REPORT APPROVAL / EDIT / ACTION LOG
-- Chạy một lần trên database hiện tại.
-- Không xóa dữ liệu và không drop bảng.
-- =====================================================

USE worker_management;

-- production_reports_temp: thêm người cập nhật gần nhất.
ALTER TABLE production_reports_temp
    ADD COLUMN IF NOT EXISTS updated_by INT NULL AFTER reviewed_by;

-- Bảng log hành động tổng quát.
CREATE TABLE IF NOT EXISTS report_action_logs
(
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_type ENUM('temp', 'approved') NOT NULL,
    report_id INT NOT NULL,
    user_id INT NOT NULL,
    action ENUM(
        'CREATE',
        'VIEW',
        'UPDATE',
        'APPROVE',
        'REJECT',
        'REQUEST_FIX',
        'DELETE',
        'EXPORT'
    ) NOT NULL,
    note TEXT,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_report_action_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_temp_status_date
    ON production_reports_temp(status, work_date);

CREATE INDEX IF NOT EXISTS idx_temp_duplicate
    ON production_reports_temp(work_date, shift, machine_no, product_name);

CREATE INDEX IF NOT EXISTS idx_report_action_target
    ON report_action_logs(report_type, report_id, created_at);

CREATE INDEX IF NOT EXISTS idx_report_action_user
    ON report_action_logs(user_id, created_at);

-- TiDB có thể chưa hỗ trợ ADD CONSTRAINT IF NOT EXISTS.
-- Chỉ chạy đoạn dưới nếu production_reports_temp.updated_by chưa có khóa ngoại.
-- ALTER TABLE production_reports_temp
--     ADD CONSTRAINT fk_temp_updated_by
--     FOREIGN KEY (updated_by) REFERENCES users(id)
--     ON DELETE SET NULL;
