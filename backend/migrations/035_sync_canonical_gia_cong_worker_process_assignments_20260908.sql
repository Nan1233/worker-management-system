-- KTC: synchronize legacy Cắt/Lồng assignments with canonical Gia công (GC).
--
-- The manager personnel page groups workers by the canonical process returned
-- from /users/options/processes. Older worker/manager assignments can still
-- point at a legacy Cắt/Lồng process row, so the canonical GC row receives
-- the same assignment as a compatibility mapping.
--
-- Keep the legacy assignment intact: production/report history may still
-- reference the original process id. INSERT IGNORE also keeps this migration
-- safe when the canonical assignment already exists.

INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT DISTINCT
    wp.worker_id,
    gc.id
FROM worker_processes wp
JOIN processes legacy
  ON legacy.id = wp.process_id
JOIN processes gc
  ON UPPER(TRIM(gc.process_code)) = 'GC'
 AND COALESCE(gc.status, 'active') IN ('active', 'enabled', '1')
WHERE legacy.id <> gc.id
  AND (
      UPPER(TRIM(COALESCE(legacy.process_code, ''))) IN ('CAT_LONG', 'CATLONG', 'CUT_LONG')
      OR (
          LOWER(TRIM(legacy.process_name)) LIKE '%cắt%'
          AND LOWER(TRIM(legacy.process_name)) LIKE '%lồng%'
      )
      OR (
          LOWER(TRIM(legacy.process_name)) LIKE '%cat%'
          AND LOWER(TRIM(legacy.process_name)) LIKE '%long%'
      )
  );

INSERT IGNORE INTO manager_processes (manager_id, process_id)
SELECT DISTINCT
    mp.manager_id,
    gc.id
FROM manager_processes mp
JOIN processes legacy
  ON legacy.id = mp.process_id
JOIN processes gc
  ON UPPER(TRIM(gc.process_code)) = 'GC'
 AND COALESCE(gc.status, 'active') IN ('active', 'enabled', '1')
WHERE legacy.id <> gc.id
  AND (
      UPPER(TRIM(COALESCE(legacy.process_code, ''))) IN ('CAT_LONG', 'CATLONG', 'CUT_LONG')
      OR (
          LOWER(TRIM(legacy.process_name)) LIKE '%cắt%'
          AND LOWER(TRIM(legacy.process_name)) LIKE '%lồng%'
      )
      OR (
          LOWER(TRIM(legacy.process_name)) LIKE '%cat%'
          AND LOWER(TRIM(legacy.process_name)) LIKE '%long%'
      )
  );
