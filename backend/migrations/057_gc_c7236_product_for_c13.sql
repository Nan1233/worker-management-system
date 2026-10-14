-- KTC 057: make the existing C7236 alias usable on manual cutting machine C13.
-- Migration 047 maps C7236 -> R7236; migration 048 contains the 7236 family
-- at standard_output 690, but the canonical R7236 product standard was missing.
SET @gc_process_id := (
  SELECT id FROM processes
  WHERE UPPER(TRIM(process_code)) = 'GC'
  LIMIT 1
);
SET @c13_machine_id := (
  SELECT id FROM machines
  WHERE process_id = @gc_process_id
    AND UPPER(TRIM(machine_code)) = 'C13'
  LIMIT 1
);

INSERT INTO product_standards (
  process_id, work_type, product_code, standard_output,
  exclude_kqd_from_tt, status
)
SELECT @gc_process_id, 'GC', 'R7236', 690, 0, 'active'
WHERE @gc_process_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM product_standards
    WHERE process_id = @gc_process_id
      AND UPPER(TRIM(product_code)) = 'R7236'
  );

UPDATE product_standards
SET standard_output = 690, status = 'active'
WHERE process_id = @gc_process_id
  AND UPPER(TRIM(product_code)) = 'R7236';

INSERT INTO product_machine_standards (
  process_id, product_code, machine_id, standard_output,
  standard_time_seconds, calculated_output_per_hour,
  source_name, effective_from, is_active
)
SELECT @gc_process_id, 'R7236', @c13_machine_id, 690,
       3600 / 690, 690, 'KTC C13 product mapping', CURRENT_DATE(), 1
WHERE @gc_process_id IS NOT NULL
  AND @c13_machine_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM product_machine_standards
    WHERE process_id = @gc_process_id
      AND UPPER(TRIM(product_code)) = 'R7236'
      AND machine_id = @c13_machine_id
      AND is_active = 1
  );

UPDATE product_machine_standards
SET standard_output = 690,
    standard_time_seconds = 3600 / 690,
    calculated_output_per_hour = 690,
    is_active = 1
WHERE process_id = @gc_process_id
  AND UPPER(TRIM(product_code)) = 'R7236'
  AND machine_id = @c13_machine_id;
