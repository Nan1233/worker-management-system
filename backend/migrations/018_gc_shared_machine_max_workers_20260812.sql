-- Wave 0 requirement lock R4: machines 5/6/7/11 allow up to 4 workers.
-- Physical output allocation remains intentionally undefined/open for Wave 1.
UPDATE machines m
JOIN processes p ON p.id = m.process_id
SET m.max_workers_per_machine = 4,
    m.output_basis = 'MACHINE'
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND CAST(REGEXP_SUBSTR(UPPER(TRIM(m.machine_code)), '[0-9]+') AS UNSIGNED) IN (5,6,7,11);
