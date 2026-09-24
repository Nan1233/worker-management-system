-- KTC 026: prerequisite table for product standard version migrations.
-- Must run before migration 032. Safe for databases where the table already exists.

CREATE TABLE IF NOT EXISTS product_standard_versions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    process_id BIGINT NOT NULL,
    product_code VARCHAR(180) NOT NULL,
    standard_output DECIMAL(18,6) NOT NULL,
    exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
    version_no INT NOT NULL DEFAULT 1,
    effective_from DATE NULL,
    effective_to DATE NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_product_standard_versions_process_product_version (process_id, product_code, version_no),
    KEY idx_product_standard_versions_lookup (process_id, product_code, status, effective_from)
);
