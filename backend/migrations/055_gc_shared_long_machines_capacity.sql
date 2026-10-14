-- KTC 055: allow shared worker reporting on GC Lồng machines ML1..ML20.
-- Legacy rows were seeded with max_workers_per_machine=1, causing workers
-- to be blocked when another worker already reported the same machine/shift.
SET @gc_process_id := (
  SELECT id FROM processes
  WHERE UPPER(TRIM(process_code)) = 'GC'
  LIMIT 1
);

UPDATE machines
SET max_workers_per_machine = 4,
    status = 'active'
WHERE process_id = @gc_process_id
  AND UPPER(TRIM(machine_code)) REGEXP '^ML[0-9]+$';
