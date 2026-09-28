-- KTC 030: Persist report KPI calculations in the database.
--
-- Business formulas:
--   TT định mức = Định mức/giờ * TT giờ thực tế
--   % năng suất = TT / TT định mức * 100
--   % PP = NG / TT * 100
--
-- TiDB does not support triggers, so these are virtual generated columns.
-- They are part of the DB schema, are queryable/exportable via SELECT pr.*,
-- and always stay synchronized when the source report values change.

ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS tt_dinh_muc DECIMAL(20,6)
    AS (
      CASE
        WHEN COALESCE(standard_output, 0) > 0
         AND COALESCE(actual_time, 0) > 0
        THEN COALESCE(standard_output, 0) * COALESCE(actual_time, 0)
        ELSE 0
      END
    ) VIRTUAL AFTER actual_output;

ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS nang_suat_percent DECIMAL(20,6)
    AS (
      CASE
        WHEN (
          COALESCE(standard_output, 0) > 0
          AND COALESCE(actual_time, 0) > 0
          AND (COALESCE(standard_output, 0) * COALESCE(actual_time, 0)) > 0
        )
        THEN (COALESCE(actual_output, 0) / (COALESCE(standard_output, 0) * COALESCE(actual_time, 0))) * 100
        ELSE 0
      END
    ) VIRTUAL AFTER tt_dinh_muc;

ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS pp_percent DECIMAL(20,6)
    AS (
      CASE
        WHEN COALESCE(actual_output, 0) > 0
        THEN (COALESCE(tt_ng, 0) / COALESCE(actual_output, 0)) * 100
        ELSE 0
      END
    ) VIRTUAL AFTER nang_suat_percent;

ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS tt_dinh_muc DECIMAL(20,6)
    AS (
      CASE
        WHEN COALESCE(standard_output, 0) > 0
         AND COALESCE(actual_time, 0) > 0
        THEN COALESCE(standard_output, 0) * COALESCE(actual_time, 0)
        ELSE 0
      END
    ) VIRTUAL AFTER actual_output;

ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS nang_suat_percent DECIMAL(20,6)
    AS (
      CASE
        WHEN (
          COALESCE(standard_output, 0) > 0
          AND COALESCE(actual_time, 0) > 0
          AND (COALESCE(standard_output, 0) * COALESCE(actual_time, 0)) > 0
        )
        THEN (COALESCE(actual_output, 0) / (COALESCE(standard_output, 0) * COALESCE(actual_time, 0))) * 100
        ELSE 0
      END
    ) VIRTUAL AFTER tt_dinh_muc;

ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS pp_percent DECIMAL(20,6)
    AS (
      CASE
        WHEN COALESCE(actual_output, 0) > 0
        THEN (COALESCE(tt_ng, 0) / COALESCE(actual_output, 0)) * 100
        ELSE 0
      END
    ) VIRTUAL AFTER nang_suat_percent;
