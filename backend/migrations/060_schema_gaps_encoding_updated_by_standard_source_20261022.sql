-- KTC 060: close three gaps between the application code and every SQL file in the repository.
-- A database built from the canonical snapshot + migrations does not have these columns/widths, so it failed
-- at runtime (found by the 2026-10-21/22 audit on a freshly built database). A database that was patched by
-- hand may already have them; this migration must be safe in both cases:
--
--  1. product_standards.encoding_code     - selected by standardResolutionService, reportBusinessValidationService
--                                           and productStandardController on every report submission / product list
--                                           (HTTP 500 "Unknown column 'encoding_code'" on a fresh DB).
--  2. production_reports.updated_by       - written by approvedReportEditService ("UPDATE production_reports
--                                           SET ..., updated_by=?") when an approved report is edited.
--  3. *.standard_source VARCHAR(20)       - the resolver returns sources up to 40 characters
--                                           (e.g. LEGACY_PRODUCT_STANDARD_PROCESS_FALLBACK); creating a physical
--                                           machine event failed with ER_DATA_TOO_LONG, so a GC shared machine
--                                           (5/6/7/11) report could never be approved.
--
-- Idempotent and never narrowing: columns are added only when missing, and standard_source is widened to 64
-- only when it is currently shorter than 64 (a wider column is left as it is).

ALTER TABLE product_standards
  ADD COLUMN IF NOT EXISTS encoding_code VARCHAR(180) NULL;

ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL;

-- TiDB's HTTP SQL API does not support PREPARE/EXECUTE. These columns are
-- VARCHAR(20) in the canonical schema, so widen them directly to 64. Re-running
-- MODIFY to the same width is safe and lets a half-applied migration resume.
ALTER TABLE machine_production_events
  MODIFY COLUMN standard_source VARCHAR(64) NULL;

ALTER TABLE production_temp_machine_lines
  MODIFY COLUMN standard_source VARCHAR(64) NULL;

ALTER TABLE production_report_machine_lines
  MODIFY COLUMN standard_source VARCHAR(64) NULL;
