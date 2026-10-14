-- KTC 056: apply shared-worker capacity consistently to every active GC machine.
-- Covers both cutting machines (C1..C13) and lồng machines (ML1..ML20).
SET @gc_process_id := (
  SELECT id FROM processes
  WHERE UPPER(TRIM(process_code)) = 'GC'
  LIMIT 1
);

UPDATE machines
SET max_workers_per_machine = 4
WHERE process_id = @gc_process_id
  AND status = 'active';
