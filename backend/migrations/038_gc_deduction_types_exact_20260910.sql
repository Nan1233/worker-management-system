-- KTC 038: Gia công (GC) uses exactly these 10 deduction types.
-- Keep existing rows for history; deactivate every other GC deduction.

UPDATE deduction_types d
JOIN processes p ON p.id = d.process_id
SET d.status = 'inactive'
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND LOWER(TRIM(COALESCE(d.deduction_name, ''))) NOT IN (
    LOWER('Thiếu sản lượng'),
    LOWER('Chuyển mã'),
    LOWER('Chỉnh máy'),
    LOWER('Nghỉ giải lao'),
    LOWER('Giao ca'),
    LOWER('Dừng máy đi hỗ trợ'),
    LOWER('Giặt cs/cân cs, tuốt-tái pp, GL'),
    LOWER('5s'),
    LOWER('Học việc, đào tạo'),
    LOWER('Đi muộn về sớm')
  );

-- Ensure all 10 canonical rows exist for GC.
INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT p.id, v.deduction_code, v.deduction_name, v.sort_order, 'active'
FROM processes p
JOIN (
  SELECT 'THIEU_SAN_LUONG' AS deduction_code, 'Thiếu sản lượng' AS deduction_name, 1 AS sort_order
  UNION ALL SELECT 'CHUYEN_MA', 'Chuyển mã', 2
  UNION ALL SELECT 'CHINH_MAY', 'Chỉnh máy', 3
  UNION ALL SELECT 'NGHI_GIAI_LAO', 'Nghỉ giải lao', 4
  UNION ALL SELECT 'GIAO_CA', 'Giao ca', 5
  UNION ALL SELECT 'DUNG_MAY_HO_TRO', 'Dừng máy đi hỗ trợ', 6
  UNION ALL SELECT 'GIAT_CS_CAN_CS_TUOT_TAI_PP_GL', 'Giặt cs/cân cs, tuốt-tái pp, GL', 7
  UNION ALL SELECT '5S', '5s', 8
  UNION ALL SELECT 'HOC_VIEC_DAO_TAO', 'Học việc, đào tạo', 9
  UNION ALL SELECT 'DI_MUON_VE_SOM', 'Đi muộn về sớm', 10
) v
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND NOT EXISTS (
    SELECT 1
    FROM deduction_types d
    WHERE d.process_id = p.id
      AND LOWER(TRIM(d.deduction_name)) = LOWER(TRIM(v.deduction_name))
  );

-- Reactivate the canonical 10 in case they existed but were inactive.
UPDATE deduction_types d
JOIN processes p ON p.id = d.process_id
SET d.status = 'active'
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND LOWER(TRIM(d.deduction_name)) IN (
    LOWER('Thiếu sản lượng'), LOWER('Chuyển mã'), LOWER('Chỉnh máy'),
    LOWER('Nghỉ giải lao'), LOWER('Giao ca'), LOWER('Dừng máy đi hỗ trợ'),
    LOWER('Giặt cs/cân cs, tuốt-tái pp, GL'), LOWER('5s'),
    LOWER('Học việc, đào tạo'), LOWER('Đi muộn về sớm')
  );
