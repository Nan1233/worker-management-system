-- KTC 059: store the Cắt/Lồng work type of each GC machine in the machine master.
--
-- Before this migration the backend and frontend inferred the work type from the
-- machine-code prefix (C1..C12 => Cắt, ML1..ML20 => Lồng). That allow-list silently
-- rejected C13 (added by migration 054) with GC_WORK_TYPE_UNRESOLVED, and the
-- frontend and backend used different ranges. The machine master is now the
-- single source of truth: machines.gc_work_type is 'CUT', 'LONG' or NULL.
--
-- Backfill is evidence-based and intentionally narrow: only GC machines whose
-- seeded machine_name states the type ("Máy cắt số N" / "Máy lồng số N", see
-- migrations 049 and 054) are classified. Any other machine stays NULL and the
-- application reports "chưa được cấu hình loại gia công" instead of guessing.
-- Existing production reports are not touched. Idempotent: only rows that are
-- still NULL are updated, and the column is added only if missing.

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS gc_work_type VARCHAR(10) NULL;

UPDATE machines m
JOIN processes p ON p.id = m.process_id
SET m.gc_work_type = 'CUT'
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND m.gc_work_type IS NULL
  AND m.machine_name REGEXP '^Máy cắt số [0-9]+';

UPDATE machines m
JOIN processes p ON p.id = m.process_id
SET m.gc_work_type = 'LONG'
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND m.gc_work_type IS NULL
  AND m.machine_name REGEXP '^Máy lồng số [0-9]+';
