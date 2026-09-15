-- KTC TEST 041: enforce the exact 19 Gia công NG master types.
-- TEST BRANCH ONLY: test-gc-19-ng
-- This changes master configuration only. It does NOT rewrite historical report defects.

SET @gc_process_id := (
    SELECT id
    FROM processes
    WHERE UPPER(TRIM(process_code)) = 'GC'
    ORDER BY id
    LIMIT 1
);

CREATE TEMPORARY TABLE tmp_gc_canonical_defects (
    defect_code VARCHAR(100) NOT NULL,
    defect_name VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL,
    PRIMARY KEY (defect_code)
);

INSERT INTO tmp_gc_canonical_defects (defect_code, defect_name, sort_order) VALUES
('KQD', 'KQD', 1),
('VO_CAO_SU', 'Vỡ cao su', 2),
('K_XUOC_CONG_GAY', 'K xước cong gãy', 3),
('CAO_SU_XOAY', 'Cao su xoay', 4),
('CAT_KHONG_DUT', 'Cắt không đứt', 5),
('BAVIA', 'Bavia', 6),
('CSH', 'CSH', 7),
('PPCM', 'ppcm', 8),
('KT_LON', 'KT lớn', 9),
('KT_NHO', 'KT nhỏ', 10),
('LCS', 'LCS', 11),
('CAT_LEM', 'cắt lẹm', 12),
('RACH_NVL', 'rách nvl', 13),
('CHAN_NGAN_DAI', 'Chân ngắn dài', 14),
('SOT_VIA', 'sót via', 15),
('FURE_TRUC', 'fure trục', 16),
('LAN_CS', 'lẫn cs', 17),
('BAVIA_CAT_HUT', 'bavia cắt hụt', 18),
('THIEU_CAO_SU', 'thiếu cao su', 19);

-- 1) Reuse an existing canonical row whenever possible, otherwise reuse the
-- historical row with the same canonical name. This preserves existing IDs.
UPDATE defect_types d
JOIN tmp_gc_canonical_defects v
  ON d.process_id = @gc_process_id
 AND (
      UPPER(TRIM(d.defect_code)) = UPPER(TRIM(v.defect_code))
      OR LOWER(TRIM(d.defect_name)) = LOWER(TRIM(v.defect_name))
 )
SET d.defect_code = v.defect_code,
    d.defect_name = v.defect_name,
    d.sort_order = v.sort_order,
    d.status = 'active';

-- 2) Insert any canonical item that still has no GC row by code.
INSERT INTO defect_types (process_id, defect_code, defect_name, sort_order, status)
SELECT @gc_process_id, v.defect_code, v.defect_name, v.sort_order, 'active'
FROM tmp_gc_canonical_defects v
WHERE @gc_process_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM defect_types d
      WHERE d.process_id = @gc_process_id
        AND UPPER(TRIM(d.defect_code)) = UPPER(TRIM(v.defect_code))
  );

-- 3) Only one active master row is allowed for each canonical code.
UPDATE defect_types d
JOIN (
    SELECT process_id, defect_code, MIN(id) AS keep_id
    FROM defect_types
    WHERE process_id = @gc_process_id
      AND status = 'active'
      AND defect_code IN (SELECT defect_code FROM tmp_gc_canonical_defects)
    GROUP BY process_id, defect_code
) k
  ON d.process_id = k.process_id
 AND d.defect_code = k.defect_code
SET d.status = CASE WHEN d.id = k.keep_id THEN 'active' ELSE 'inactive' END;

-- 4) No legacy GC defect may remain selectable in the worker form.
UPDATE defect_types d
LEFT JOIN tmp_gc_canonical_defects v
  ON UPPER(TRIM(d.defect_code)) = UPPER(TRIM(v.defect_code))
SET d.status = 'inactive'
WHERE d.process_id = @gc_process_id
  AND v.defect_code IS NULL;

-- Verification: this MUST return exactly 19.
SELECT COUNT(*) AS active_gc_defect_count
FROM defect_types
WHERE process_id = @gc_process_id
  AND status = 'active';

SELECT id, process_id, defect_code, defect_name, sort_order, status
FROM defect_types
WHERE process_id = @gc_process_id
  AND status = 'active'
ORDER BY sort_order, id;

DROP TEMPORARY TABLE tmp_gc_canonical_defects;
