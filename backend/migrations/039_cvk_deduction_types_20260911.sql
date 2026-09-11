-- KTC 039: Công việc khác (CVK) uses the same canonical 10 deduction types as GC.
-- Keep the master data scoped to CVK and make the operation idempotent.

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
WHERE UPPER(TRIM(p.process_code)) = 'CVK'
  AND COALESCE(p.status, 'active') IN ('active', 'enabled', '1')
  AND NOT EXISTS (
    SELECT 1
    FROM deduction_types d
    WHERE d.process_id = p.id
      AND (
        LOWER(TRIM(COALESCE(d.deduction_code, ''))) = LOWER(TRIM(v.deduction_code))
        OR LOWER(TRIM(COALESCE(d.deduction_name, ''))) = LOWER(TRIM(v.deduction_name))
      )
  );

UPDATE deduction_types d
JOIN processes p ON p.id = d.process_id
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
) v ON LOWER(TRIM(COALESCE(d.deduction_code, ''))) = LOWER(TRIM(v.deduction_code))
SET d.deduction_code = v.deduction_code,
    d.deduction_name = v.deduction_name,
    d.sort_order = v.sort_order,
    d.status = 'active'
WHERE UPPER(TRIM(p.process_code)) = 'CVK';
