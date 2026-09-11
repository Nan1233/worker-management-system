-- KTC 040: Canonical NG master for Gia công (GC / Cắt-Lồng).
-- Source of truth: the latest factory NG list supplied for this process.
-- IMPORTANT: this is master data, not a frontend fallback list.
-- Historical defect_type rows are kept for existing reports; only the active
-- GC master is replaced with the canonical 19 items below.

SET @gc_process_id := (
    SELECT id
      FROM processes
     WHERE UPPER(TRIM(process_code)) = 'GC'
     ORDER BY id
     LIMIT 1
);

-- 1. Upsert the canonical 19 active defect types.
INSERT INTO defect_types (process_id, defect_code, defect_name, sort_order, status)
SELECT @gc_process_id, v.defect_code, v.defect_name, v.sort_order, 'active'
  FROM (
    SELECT 'KQD' AS defect_code, 'KQD' AS defect_name, 1 AS sort_order
    UNION ALL SELECT 'VO_CAO_SU', 'Vỡ cao su', 2
    UNION ALL SELECT 'K_XUOC_CONG_GAY', 'K xước cong gãy', 3
    UNION ALL SELECT 'CAO_SU_XOAY', 'Cao su xoay', 4
    UNION ALL SELECT 'CAT_KHONG_DUT', 'Cắt không đứt', 5
    UNION ALL SELECT 'BAVIA', 'Bavia', 6
    UNION ALL SELECT 'CSH', 'CSH', 7
    UNION ALL SELECT 'PPCM', 'ppcm', 8
    UNION ALL SELECT 'KT_LON', 'KT lớn', 9
    UNION ALL SELECT 'KT_NHO', 'KT nhỏ', 10
    UNION ALL SELECT 'LCS', 'LCS', 11
    UNION ALL SELECT 'CAT_LEM', 'cắt lẹm', 12
    UNION ALL SELECT 'RACH_NVL', 'rách nvl', 13
    UNION ALL SELECT 'CHAN_NGAN_DAI', 'Chân ngắn dài', 14
    UNION ALL SELECT 'SOT_VIA', 'sót via', 15
    UNION ALL SELECT 'FURE_TRUC', 'fure trục', 16
    UNION ALL SELECT 'LAN_CS', 'lẫn cs', 17
    UNION ALL SELECT 'BAVIA_CAT_HUT', 'bavia cắt hụt', 18
    UNION ALL SELECT 'THIEU_CAO_SU', 'thiếu cao su', 19
  ) v
 WHERE @gc_process_id IS NOT NULL
   AND NOT EXISTS (
       SELECT 1
         FROM defect_types d
        WHERE d.process_id = @gc_process_id
          AND LOWER(TRIM(d.defect_name)) = LOWER(TRIM(v.defect_name))
   );

-- 2. Re-activate/update an exact canonical row if it already exists.
UPDATE defect_types d
JOIN (
    SELECT 'KQD' AS defect_code, 'KQD' AS defect_name, 1 AS sort_order
    UNION ALL SELECT 'VO_CAO_SU', 'Vỡ cao su', 2
    UNION ALL SELECT 'K_XUOC_CONG_GAY', 'K xước cong gãy', 3
    UNION ALL SELECT 'CAO_SU_XOAY', 'Cao su xoay', 4
    UNION ALL SELECT 'CAT_KHONG_DUT', 'Cắt không đứt', 5
    UNION ALL SELECT 'BAVIA', 'Bavia', 6
    UNION ALL SELECT 'CSH', 'CSH', 7
    UNION ALL SELECT 'PPCM', 'ppcm', 8
    UNION ALL SELECT 'KT_LON', 'KT lớn', 9
    UNION ALL SELECT 'KT_NHO', 'KT nhỏ', 10
    UNION ALL SELECT 'LCS', 'LCS', 11
    UNION ALL SELECT 'CAT_LEM', 'cắt lẹm', 12
    UNION ALL SELECT 'RACH_NVL', 'rách nvl', 13
    UNION ALL SELECT 'CHAN_NGAN_DAI', 'Chân ngắn dài', 14
    UNION ALL SELECT 'SOT_VIA', 'sót via', 15
    UNION ALL SELECT 'FURE_TRUC', 'fure trục', 16
    UNION ALL SELECT 'LAN_CS', 'lẫn cs', 17
    UNION ALL SELECT 'BAVIA_CAT_HUT', 'bavia cắt hụt', 18
    UNION ALL SELECT 'THIEU_CAO_SU', 'thiếu cao su', 19
) v ON d.process_id = @gc_process_id
   AND LOWER(TRIM(d.defect_name)) = LOWER(TRIM(v.defect_name))
SET d.defect_code = v.defect_code,
    d.defect_name = v.defect_name,
    d.sort_order = v.sort_order,
    d.status = 'active';

-- 3. Deactivate legacy GC defects that are not in the canonical 19.
UPDATE defect_types
   SET status = 'inactive'
 WHERE process_id = @gc_process_id
   AND LOWER(TRIM(defect_name)) NOT IN (
       'kqd',
       'vỡ cao su',
       'k xước cong gãy',
       'cao su xoay',
       'cắt không đứt',
       'bavia',
       'csh',
       'ppcm',
       'kt lớn',
       'kt nhỏ',
       'lcs',
       'cắt lẹm',
       'rách nvl',
       'chân ngắn dài',
       'sót via',
       'fure trục',
       'lẫn cs',
       'bavia cắt hụt',
       'thiếu cao su'
   );

-- Verification target: exactly 19 active GC defect types.
SELECT COUNT(*) AS active_gc_defect_count
  FROM defect_types
 WHERE process_id = @gc_process_id
   AND status = 'active';
