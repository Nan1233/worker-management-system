-- KTC 061: link per-machine reports created from one worker submission.
-- Additive and backward-compatible: existing reports remain ungrouped (NULL).
-- Application code will populate this key only for newly split machine submissions.
ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS submission_group_id VARCHAR(80) NULL;

ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS submission_group_id VARCHAR(80) NULL;

CREATE INDEX IF NOT EXISTS idx_temp_submission_group
  ON production_reports_temp (submission_group_id);

CREATE INDEX IF NOT EXISTS idx_approved_submission_group
  ON production_reports (submission_group_id);
