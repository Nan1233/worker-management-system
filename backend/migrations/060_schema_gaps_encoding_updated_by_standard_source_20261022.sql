-- KTC 060: close two schema gaps between the application code and the canonical SQL files.
-- A database built from the canonical snapshot + migrations lacks these columns, so it failed at runtime
-- (found by the 2026-10-21/22 audit on a freshly built database). A database patched by hand may already
-- have them; this migration must be safe in both cases:
--
--  1. product_standards.encoding_code  - selected by standardResolutionService, reportBusinessValidationService
--                                        and productStandardController on every report submission / product list
--                                        (HTTP 500 "Unknown column 'encoding_code'" on a fresh DB).
--  2. production_reports.updated_by    - written by approvedReportEditService ("UPDATE production_reports
--                                        SET ..., updated_by=?") when an approved report is edited.
--
-- Deliberately NOT in this file: widening *.standard_source (VARCHAR(20) in the canonical schema).
--  * The application stores standard_source through storedStandardSource() (backend/utils/standardSourceCode.js),
--    which maps every resolver label to a code of at most 20 characters or fails loudly, so no column has to
--    be widened for approvals to work.
--  * Widening conditionally needs PREPARE/EXECUTE with session variables. The Cloudflare TiDB serverless driver
--    runs every statement as its own HTTP request (no session state between statements, no transaction in the
--    migration runner), so that cannot work there. An unconditional MODIFY COLUMN ... VARCHAR(64) would try to
--    NARROW a column that was already widened by hand, and TiDB rejects narrowing (Unsupported modify column).
--
-- Idempotent and additive only: ADD COLUMN IF NOT EXISTS (same form as 005, 027, 029, 030). No DELETE, DROP,
-- TRUNCATE, no narrowing, no session state. Safe to restart from statement 1.

ALTER TABLE product_standards
  ADD COLUMN IF NOT EXISTS encoding_code VARCHAR(180) NULL;

ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL;
