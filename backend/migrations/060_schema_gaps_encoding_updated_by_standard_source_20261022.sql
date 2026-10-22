-- KTC 060: close three gaps between the application code and every SQL file in the repository.
-- The live database already has these columns/widths (earlier hand-run rebuilds); a database built
-- from canonical snapshot + migrations did not, so it failed at runtime (found by the 2026-10-21/22
-- audit on a freshly built database):
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
-- Idempotent: columns are added only when missing; widening a VARCHAR never loses data and is a no-op
-- when the column is already wide enough.

ALTER TABLE product_standards
  ADD COLUMN IF NOT EXISTS encoding_code VARCHAR(180) NULL;

ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL;

ALTER TABLE machine_production_events
  MODIFY COLUMN standard_source VARCHAR(64) NULL;

ALTER TABLE production_temp_machine_lines
  MODIFY COLUMN standard_source VARCHAR(64) NULL;

ALTER TABLE production_report_machine_lines
  MODIFY COLUMN standard_source VARCHAR(64) NULL;
