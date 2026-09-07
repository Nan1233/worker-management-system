-- KTC: non-product work process + late/early deduction master.
-- Non-product work: Xuất / Nhập / Hỗ trợ / Kho / Vệ sinh / Công việc khác.

INSERT INTO processes (process_code, process_name, status)
SELECT 'CVK', 'Công việc khác (Không theo mã sản phẩm)', 'active'
WHERE NOT EXISTS (
    SELECT 1 FROM processes WHERE UPPER(TRIM(process_code)) = 'CVK'
);

-- Keep late/early as an explicit deduction type for GC.
INSERT INTO deduction_types (process_id, deduction_code, deduction_name, status)
SELECT p.id, 'DI_MUON_VE_SOM', 'Đi muộn về sớm', 'active'
FROM processes p
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND COALESCE(p.status, 'active') IN ('active', 'enabled', '1')
  AND NOT EXISTS (
      SELECT 1
      FROM deduction_types d
      WHERE d.process_id = p.id
        AND (
            UPPER(TRIM(d.deduction_code)) = 'DI_MUON_VE_SOM'
            OR LOWER(TRIM(d.deduction_name)) = LOWER('Đi muộn về sớm')
        )
  );
