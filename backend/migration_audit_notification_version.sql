CREATE TABLE IF NOT EXISTS report_versions (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 report_type ENUM('temp','approved') NOT NULL,
 report_id BIGINT NOT NULL,
 version_no INT NOT NULL,
 snapshot_json JSON NOT NULL,
 change_reason VARCHAR(500) NULL,
 created_by BIGINT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_report_version(report_type, report_id, version_no),
 KEY idx_report_versions(report_type, report_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT NOT NULL,
 type VARCHAR(50) NOT NULL DEFAULT 'info',
 title VARCHAR(180) NOT NULL,
 message VARCHAR(1000) NOT NULL,
 link_url VARCHAR(500) NULL,
 entity_type VARCHAR(50) NULL,
 entity_id BIGINT NULL,
 is_read TINYINT(1) NOT NULL DEFAULT 0,
 read_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_notifications_user(user_id, is_read, created_at),
 CONSTRAINT fk_notifications_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT NULL,
 action VARCHAR(80) NOT NULL,
 entity_type VARCHAR(50) NULL,
 entity_id BIGINT NULL,
 description VARCHAR(1000) NULL,
 metadata_json JSON NULL,
 ip_address VARCHAR(64) NULL,
 user_agent VARCHAR(500) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_activity_user(user_id, created_at),
 KEY idx_activity_entity(entity_type, entity_id, created_at),
 CONSTRAINT fk_activity_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
