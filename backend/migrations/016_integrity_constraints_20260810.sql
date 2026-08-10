-- KTC 016: Data integrity hardening for production detail rows and review queries.
-- Duplicate child rows are normalized by runMigrations.js preflight before these
-- UNIQUE indexes are created. Orphan rows are intentionally NOT deleted here;
-- `npm run db:integrity` reports them so production data is never silently lost.

ALTER TABLE production_temp_defects
  ADD UNIQUE KEY uq_temp_defect_once (temp_report_id, defect_type_id);

ALTER TABLE production_report_defects
  ADD UNIQUE KEY uq_report_defect_once (report_id, defect_type_id);

ALTER TABLE production_temp_deductions
  ADD UNIQUE KEY uq_temp_deduction_once (temp_report_id, deduction_type_id);

ALTER TABLE production_report_deductions
  ADD UNIQUE KEY uq_report_deduction_once (report_id, deduction_type_id);

CREATE INDEX idx_prt_review_queue
  ON production_reports_temp (status, process_id, work_date, updated_at);

CREATE INDEX idx_pr_approved_export
  ON production_reports (status, process_id, work_date, approved_at);
