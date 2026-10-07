-- KTC 053: Restore the full 16 canonical GC "Thời gian trừ" (deduction) types.
--
-- Migration 038 ("GC deduction types exact") deactivated every GC deduction
-- not in a hardcoded list of 10, which accidentally dropped 6 types that are
-- still part of the canonical GC template (backend/config/ktcTemplateMasterData.js,
-- GC.deductions, 16 entries) and are used by the Worker and Machine deduction
-- dropdowns via the shared activeDeductionOptions master-data source:
--   Bật máy, xét máy
--   Chờ chỉnh máy
--   Mất điện
--   Mất khí
--   Chờ hàng
--   bảo dưỡng máy
--
-- This migration only reactivates these 6 for GC. It does not touch any other
-- process, does not delete or rename anything, and keeps existing ids/codes
-- (same "reuse by name, keep history" approach as 034/035/038).

-- Reactivate existing rows by name if they already exist (status flip only).
UPDATE deduction_types d
JOIN processes p ON p.id = d.process_id
SET d.status = 'active'
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND LOWER(TRIM(d.deduction_name)) IN (
    LOWER('Bật máy, xét máy'),
    LOWER('Chờ chỉnh máy'),
    LOWER('Mất điện'),
    LOWER('Mất khí'),
    LOWER('Chờ hàng'),
    LOWER('bảo dưỡng máy')
  );

-- Safety net: insert any of the 6 that no longer exist as a row at all for GC
-- (e.g. if they were removed rather than merely deactivated elsewhere).
INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT p.id, v.deduction_code, v.deduction_name, v.sort_order, 'active'
FROM processes p
JOIN (
  SELECT 'BAT_MAY_XET_MAY' AS deduction_code, 'Bật máy, xét máy' AS deduction_name, 2 AS sort_order
  UNION ALL SELECT 'CHO_CHINH_MAY', 'Chờ chỉnh máy', 5
  UNION ALL SELECT 'MAT_DIEN', 'Mất điện', 6
  UNION ALL SELECT 'MAT_KHI', 'Mất khí', 7
  UNION ALL SELECT 'CHO_HANG', 'Chờ hàng', 8
  UNION ALL SELECT 'BAO_DUONG_MAY', 'bảo dưỡng máy', 9
) v
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND NOT EXISTS (
    SELECT 1
    FROM deduction_types d
    WHERE d.process_id = p.id
      AND LOWER(TRIM(d.deduction_name)) = LOWER(TRIM(v.deduction_name))
  );
