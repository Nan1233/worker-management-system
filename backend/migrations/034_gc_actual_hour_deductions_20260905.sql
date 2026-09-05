-- KTC: GC actual-hour deduction master.
-- Goal: keep historical deduction rows/data while making the active GC master
-- exactly match the 9 actual-hour deduction categories.
-- Historical report/temp deduction rows are never deleted.

-- 1) Ensure the canonical 9 GC deduction types exist.
INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT p.id, 'DED_GC_001', 'Thiếu sản lượng', 1, 'active'
  FROM processes p
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND NOT EXISTS (
       SELECT 1 FROM deduction_types d
        WHERE d.process_id = p.id
          AND LOWER(TRIM(d.deduction_name)) = LOWER('Thiếu sản lượng')
   );

INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT p.id, 'DED_GC_002', 'Chuyển mã', 2, 'active'
  FROM processes p
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND NOT EXISTS (
       SELECT 1 FROM deduction_types d
        WHERE d.process_id = p.id
          AND LOWER(TRIM(d.deduction_name)) = LOWER('Chuyển mã')
   );

INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT p.id, 'DED_GC_003', 'Chỉnh máy', 3, 'active'
  FROM processes p
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND NOT EXISTS (
       SELECT 1 FROM deduction_types d
        WHERE d.process_id = p.id
          AND LOWER(TRIM(d.deduction_name)) = LOWER('Chỉnh máy')
   );

INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT p.id, 'DED_GC_004', 'Nghỉ giải lao', 4, 'active'
  FROM processes p
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND NOT EXISTS (
       SELECT 1 FROM deduction_types d
        WHERE d.process_id = p.id
          AND LOWER(TRIM(d.deduction_name)) = LOWER('Nghỉ giải lao')
   );

INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT p.id, 'DED_GC_005', 'Giao ca', 5, 'active'
  FROM processes p
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND NOT EXISTS (
       SELECT 1 FROM deduction_types d
        WHERE d.process_id = p.id
          AND LOWER(TRIM(d.deduction_name)) = LOWER('Giao ca')
   );

INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT p.id, 'DED_GC_006', 'Dừng máy đi hỗ trợ', 6, 'active'
  FROM processes p
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND NOT EXISTS (
       SELECT 1 FROM deduction_types d
        WHERE d.process_id = p.id
          AND LOWER(TRIM(d.deduction_name)) = LOWER('Dừng máy đi hỗ trợ')
   );

INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT p.id, 'DED_GC_007', 'Giặt cs/cân cs, tuốt-tái pp, GL', 7, 'active'
  FROM processes p
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND NOT EXISTS (
       SELECT 1 FROM deduction_types d
        WHERE d.process_id = p.id
          AND LOWER(TRIM(d.deduction_name)) = LOWER('Giặt cs/cân cs, tuốt-tái pp, GL')
   );

INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT p.id, 'DED_GC_008', '5s', 8, 'active'
  FROM processes p
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND NOT EXISTS (
       SELECT 1 FROM deduction_types d
        WHERE d.process_id = p.id
          AND LOWER(TRIM(d.deduction_name)) = LOWER('5s')
   );

INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT p.id, 'DED_GC_009', 'Học việc, đào tạo', 9, 'active'
  FROM processes p
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND NOT EXISTS (
       SELECT 1 FROM deduction_types d
        WHERE d.process_id = p.id
          AND LOWER(TRIM(d.deduction_name)) = LOWER('Học việc, đào tạo')
   );

-- 2) Normalize the existing 5S master row where possible. This deliberately
-- does NOT delete any old row. If an exact '5s' row already exists, it is the
-- canonical target and historical rows are remapped to it below.
UPDATE deduction_types d
JOIN processes p ON p.id = d.process_id
   SET d.deduction_name = '5s',
       d.deduction_code = 'DED_GC_008',
       d.sort_order = 8,
       d.status = 'active'
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND LOWER(TRIM(d.deduction_name)) IN (
       '5s, đổ bụi,xì bụi,lấy bụi',
       '5s, đổ bụi, xì bụi, lấy bụi'
   )
   AND NOT EXISTS (
       SELECT 1 FROM deduction_types x
        WHERE x.process_id = d.process_id
          AND x.id <> d.id
          AND LOWER(TRIM(x.deduction_name)) = '5s'
   );

-- 3) Resolve the canonical IDs for all 9 names and remap historical 5S rows.
-- The hours and report/temp-report IDs remain untouched.
UPDATE production_report_deductions r
JOIN deduction_types old_d ON old_d.id = r.deduction_type_id
JOIN processes p ON p.id = old_d.process_id
JOIN deduction_types new_d
  ON new_d.process_id = p.id
 AND LOWER(TRIM(new_d.deduction_name)) = '5s'
 AND new_d.status = 'active'
   SET r.deduction_type_id = new_d.id
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND LOWER(TRIM(old_d.deduction_name)) IN (
       '5s',
       '5s, đổ bụi,xì bụi,lấy bụi',
       '5s, đổ bụi, xì bụi, lấy bụi'
   )
   AND old_d.id <> new_d.id;

UPDATE production_temp_deductions r
JOIN deduction_types old_d ON old_d.id = r.deduction_type_id
JOIN processes p ON p.id = old_d.process_id
JOIN deduction_types new_d
  ON new_d.process_id = p.id
 AND LOWER(TRIM(new_d.deduction_name)) = '5s'
 AND new_d.status = 'active'
   SET r.deduction_type_id = new_d.id
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND LOWER(TRIM(old_d.deduction_name)) IN (
       '5s',
       '5s, đổ bụi,xì bụi,lấy bụi',
       '5s, đổ bụi, xì bụi, lấy bụi'
   )
   AND old_d.id <> new_d.id;

-- 4) Canonicalize names/codes/order of the 9 active rows.
UPDATE deduction_types d
JOIN processes p ON p.id = d.process_id
   SET d.deduction_code = CASE LOWER(TRIM(d.deduction_name))
       WHEN 'thiếu sản lượng' THEN 'DED_GC_001'
       WHEN 'chuyển mã' THEN 'DED_GC_002'
       WHEN 'chỉnh máy' THEN 'DED_GC_003'
       WHEN 'nghỉ giải lao' THEN 'DED_GC_004'
       WHEN 'giao ca' THEN 'DED_GC_005'
       WHEN 'dừng máy đi hỗ trợ' THEN 'DED_GC_006'
       WHEN 'giặt cs/cân cs, tuốt-tái pp, gl' THEN 'DED_GC_007'
       WHEN '5s' THEN 'DED_GC_008'
       WHEN 'học việc, đào tạo' THEN 'DED_GC_009'
       ELSE d.deduction_code END,
       d.sort_order = CASE LOWER(TRIM(d.deduction_name))
       WHEN 'thiếu sản lượng' THEN 1
       WHEN 'chuyển mã' THEN 2
       WHEN 'chỉnh máy' THEN 3
       WHEN 'nghỉ giải lao' THEN 4
       WHEN 'giao ca' THEN 5
       WHEN 'dừng máy đi hỗ trợ' THEN 6
       WHEN 'giặt cs/cân cs, tuốt-tái pp, gl' THEN 7
       WHEN '5s' THEN 8
       WHEN 'học việc, đào tạo' THEN 9
       ELSE d.sort_order END,
       d.status = 'active'
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND LOWER(TRIM(d.deduction_name)) IN (
       'thiếu sản lượng','chuyển mã','chỉnh máy','nghỉ giải lao','giao ca',
       'dừng máy đi hỗ trợ','giặt cs/cân cs, tuốt-tái pp, gl','5s','học việc, đào tạo'
   );

-- 5) Deactivate every other GC deduction type. Historical rows remain intact
-- and still reference their original deduction_type_id.
UPDATE deduction_types d
JOIN processes p ON p.id = d.process_id
   SET d.status = 'inactive'
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND LOWER(TRIM(d.deduction_name)) NOT IN (
       'thiếu sản lượng','chuyển mã','chỉnh máy','nghỉ giải lao','giao ca',
       'dừng máy đi hỗ trợ','giặt cs/cân cs, tuốt-tái pp, gl','5s','học việc, đào tạo'
   );

-- No DELETE statements in this migration: historical deduction types and
-- historical deduction detail rows are intentionally preserved.
