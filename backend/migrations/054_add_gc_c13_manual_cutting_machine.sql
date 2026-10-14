-- KTC 054: add C13 as a non-automatic cutting machine in Gia công (GC).
-- Manual machine: one worker per machine; product-based output accounting.
SET @gc_process_id := (
  SELECT id
  FROM processes
  WHERE UPPER(TRIM(process_code)) = 'GC'
  LIMIT 1
);

INSERT INTO machines (
  process_id,
  machine_code,
  machine_name,
  is_automatic,
  max_workers_per_machine,
  output_basis,
  status
)
SELECT
  @gc_process_id,
  'C13',
  'Máy cắt số 13',
  0,
  1,
  'PRODUCT',
  'active'
WHERE @gc_process_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  machine_name = VALUES(machine_name),
  is_automatic = 0,
  max_workers_per_machine = 1,
  output_basis = 'PRODUCT',
  status = 'active';
