-- KTC 058: Add Kiểm 1 (K1) NG defect categories and time-deduction types.
-- Idempotent: reuses existing codes, reactivates only these K1 entries, and
-- never edits production reports or historical defect/deduction rows.
SET @k1_process_id := (
  SELECT id FROM processes WHERE UPPER(TRIM(process_code)) = 'K1' LIMIT 1
);

-- K1 NG categories: preserve each item as its own selectable defect type.
INSERT INTO defect_types (process_id, defect_code, defect_name, sort_order, status)
SELECT @k1_process_id, v.defect_code, v.defect_name, v.sort_order, 'active'
FROM (
  SELECT 'K1_DI_VAT_NVL' AS defect_code, 'Dị vật do NVL' AS defect_name, 1 AS sort_order
  UNION ALL SELECT 'K1_DI_VAT_SX1', 'DV do SX1', 2
  UNION ALL SELECT 'K1_DI_VAT_DINH_VIA', 'DV dính via', 3
  UNION ALL SELECT 'K1_BAN_NVL', 'Bẩn do NVL', 4
  UNION ALL SELECT 'K1_BAN_DEN_TRANG_VANG', 'Bẩn (đen, trắng, vàng)', 5
  UNION ALL SELECT 'K1_BAN_KHUON', 'Bẩn khuôn', 6
  UNION ALL SELECT 'K1_BAN_CHO_GIAT_XU_LY', 'Bẩn chờ giặt, chờ xử lý', 7
  UNION ALL SELECT 'K1_PHONG', 'Phồng', 8
  UNION ALL SELECT 'K1_BIEN_DANG', 'Biến dạng', 9
  UNION ALL SELECT 'K1_CACH_BAC', 'Cách bậc', 10
  UNION ALL SELECT 'K1_THIEU_NL', 'Thiếu NL', 11
  UNION ALL SELECT 'K1_BIT_LO', 'Bít lỗ', 12
  UNION ALL SELECT 'K1_HO_SAT', 'Hở sắt', 13
  UNION ALL SELECT 'K1_LOI_KHUON', 'Lỗi khuôn', 14
  UNION ALL SELECT 'K1_HAN', 'Hằn', 15
  UNION ALL SELECT 'K1_RACH_DPK', 'Rách ĐPK (ren, vành)', 16
  UNION ALL SELECT 'K1_RACH_BE_MAT', 'Rách (bề mặt)', 17
  UNION ALL SELECT 'K1_RACH_LO_ROT_KHI', 'Rách lỗ rót, lỗ khí', 18
  UNION ALL SELECT 'K1_RACH_DAU', 'Rách đầu', 19
  UNION ALL SELECT 'K1_RACH_THAN_TAI', 'Rách thân, tai', 20
  UNION ALL SELECT 'K1_RACH_XLBV_SX1', 'Rách do XLBV (SX1)', 21
  UNION ALL SELECT 'K1_DINH_BAVIA', 'Dính bavia', 22
  UNION ALL SELECT 'K1_BAVIA_LONG_TRONG', 'Bavia lòng trong', 23
  UNION ALL SELECT 'K1_CHO_XLBV', 'Chờ XLBV', 24
  UNION ALL SELECT 'K1_RACH_XLBV_NGOAI', 'Rách do XLBV (bên ngoài)', 25
  UNION ALL SELECT 'K1_BONG_CAO_SU', 'Bong cao su', 26
  UNION ALL SELECT 'K1_RACH_LONG_TRONG', 'Rách lòng trong', 27
  UNION ALL SELECT 'K1_KHAC_MAU', 'Khác màu', 28
  UNION ALL SELECT 'K1_LOANG_DEN_MAU', 'Loang đen, màu', 29
  UNION ALL SELECT 'K1_LOI_KHAC_HANG_MEM_ME', 'Lỗi khác (hàng mềm), mẻ', 30
) v
WHERE @k1_process_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM defect_types d
    WHERE d.process_id = @k1_process_id
      AND d.defect_code = v.defect_code
  );

UPDATE defect_types d
JOIN (
  SELECT 'K1_DI_VAT_NVL' AS defect_code UNION ALL SELECT 'K1_DI_VAT_SX1'
  UNION ALL SELECT 'K1_DI_VAT_DINH_VIA' UNION ALL SELECT 'K1_BAN_NVL'
  UNION ALL SELECT 'K1_BAN_DEN_TRANG_VANG' UNION ALL SELECT 'K1_BAN_KHUON'
  UNION ALL SELECT 'K1_BAN_CHO_GIAT_XU_LY' UNION ALL SELECT 'K1_PHONG'
  UNION ALL SELECT 'K1_BIEN_DANG' UNION ALL SELECT 'K1_CACH_BAC'
  UNION ALL SELECT 'K1_THIEU_NL' UNION ALL SELECT 'K1_BIT_LO'
  UNION ALL SELECT 'K1_HO_SAT' UNION ALL SELECT 'K1_LOI_KHUON'
  UNION ALL SELECT 'K1_HAN' UNION ALL SELECT 'K1_RACH_DPK'
  UNION ALL SELECT 'K1_RACH_BE_MAT' UNION ALL SELECT 'K1_RACH_LO_ROT_KHI'
  UNION ALL SELECT 'K1_RACH_DAU' UNION ALL SELECT 'K1_RACH_THAN_TAI'
  UNION ALL SELECT 'K1_RACH_XLBV_SX1' UNION ALL SELECT 'K1_DINH_BAVIA'
  UNION ALL SELECT 'K1_BAVIA_LONG_TRONG' UNION ALL SELECT 'K1_CHO_XLBV'
  UNION ALL SELECT 'K1_RACH_XLBV_NGOAI' UNION ALL SELECT 'K1_BONG_CAO_SU'
  UNION ALL SELECT 'K1_RACH_LONG_TRONG' UNION ALL SELECT 'K1_KHAC_MAU'
  UNION ALL SELECT 'K1_LOANG_DEN_MAU' UNION ALL SELECT 'K1_LOI_KHAC_HANG_MEM_ME'
) v ON v.defect_code = d.defect_code
SET d.status = 'active'
WHERE d.process_id = @k1_process_id;

-- K1 deduction categories. "Nhập giờ trừ" is the numeric entry control in the
-- worker form, not a separate deduction type.
INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT @k1_process_id, v.deduction_code, v.deduction_name, v.sort_order, 'active'
FROM (
  SELECT 'K1_CONG_VIEC_TRU_GIO' AS deduction_code, 'Công việc trừ giờ' AS deduction_name, 1 AS sort_order
  UNION ALL SELECT 'K1_DI_MUON_VE_SOM', 'Đi muộn, về sớm', 2
  UNION ALL SELECT 'K1_TRU_GIO_XLBV_NGUOI_LAM', 'Trừ giờ XLBV (người làm)', 3
  UNION ALL SELECT 'K1_THIEU_SAN_LUONG', 'Thiếu sản lượng', 4
) v
WHERE @k1_process_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM deduction_types d
    WHERE d.process_id = @k1_process_id
      AND d.deduction_code = v.deduction_code
  );

UPDATE deduction_types d
JOIN (
  SELECT 'K1_CONG_VIEC_TRU_GIO' AS deduction_code UNION ALL
  SELECT 'K1_DI_MUON_VE_SOM' UNION ALL
  SELECT 'K1_TRU_GIO_XLBV_NGUOI_LAM' UNION ALL
  SELECT 'K1_THIEU_SAN_LUONG'
) v ON v.deduction_code = d.deduction_code
SET d.status = 'active'
WHERE d.process_id = @k1_process_id;
