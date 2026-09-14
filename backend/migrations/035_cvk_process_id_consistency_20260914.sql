-- KTC: normalize CVK process identity.
--
-- The database currently has the canonical CVK process in `processes`, while
-- older CVK submissions may still carry the historical hard-coded process_id
-- 60006. New code resolves CVK by process_code; this migration moves legacy
-- CVK rows to the canonical process id and gives managers the same CVK scope
-- that the manager read API already exposes.

-- 1) Ensure the canonical CVK process exists before touching report rows.
INSERT INTO processes (process_code, process_name, status)
SELECT 'CVK', 'Công việc khác (Không theo mã sản phẩm)', 'active'
WHERE NOT EXISTS (
    SELECT 1
    FROM processes
    WHERE UPPER(TRIM(process_code)) = 'CVK'
);

-- 2) Move legacy CVK temp reports written with process_id=60006.
-- The extra_data marker is written by the CVK submission model, so this does
-- not rewrite unrelated records if 60006 is ever reused by another process.
UPDATE production_reports_temp pr
JOIN processes cvk
  ON UPPER(TRIM(cvk.process_code)) = 'CVK'
SET pr.process_id = cvk.id
WHERE pr.process_id = 60006
  AND cvk.id <> 60006
  AND UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(pr.extra_data, '$.process_code')), '')) = 'CVK';

-- 3) Move legacy approved CVK reports using the same explicit marker.
UPDATE production_reports pr
JOIN processes cvk
  ON UPPER(TRIM(cvk.process_code)) = 'CVK'
SET pr.process_id = cvk.id
WHERE pr.process_id = 60006
  AND cvk.id <> 60006
  AND UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(pr.extra_data, '$.process_code')), '')) = 'CVK';

-- 4) Preserve any existing manager->legacy-CVK assignments under the
-- canonical process id.
INSERT INTO manager_processes (manager_id, process_id)
SELECT DISTINCT mp.manager_id, cvk.id
FROM manager_processes mp
JOIN processes cvk
  ON UPPER(TRIM(cvk.process_code)) = 'CVK'
WHERE mp.process_id = 60006
  AND cvk.id <> 60006
  AND NOT EXISTS (
      SELECT 1
      FROM manager_processes existing
      WHERE existing.manager_id = mp.manager_id
        AND existing.process_id = cvk.id
  );

-- 5) CVK is intentionally visible to every Manager in the manager report
-- screen. Keep approval/detail authorization consistent with that rule.
INSERT INTO manager_processes (manager_id, process_id)
SELECT u.id, cvk.id
FROM users u
JOIN processes cvk
  ON UPPER(TRIM(cvk.process_code)) = 'CVK'
WHERE LOWER(TRIM(COALESCE(u.role, ''))) = 'manager'
  AND NOT EXISTS (
      SELECT 1
      FROM manager_processes mp
      WHERE mp.manager_id = u.id
        AND mp.process_id = cvk.id
  );
