-- Isolated acceptance fixture recovered from historical migration 028.
-- DO NOT run on shared/production DB; tests/integration/harness.js only.
-- Original project source: 3fe34902a1d2de68c8fdba87e1fb867ccd6118fc
CREATE TABLE IF NOT EXISTS report_edit_proposals (
    id BIGINT NOT NULL AUTO_INCREMENT,
    report_id BIGINT NOT NULL,
    proposer_user_id BIGINT NOT NULL,
    proposer_role VARCHAR(20) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    proposed_data JSON NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_rep_edit_proposals_report (report_id),
    KEY idx_rep_edit_proposals_user (proposer_user_id),
    KEY idx_rep_edit_proposals_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
