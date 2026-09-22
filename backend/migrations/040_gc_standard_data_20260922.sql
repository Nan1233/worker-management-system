-- KTC 040: canonical GC standard output/hour data.
-- TEST branch only. Source: user-provided GC standard table on 2026-09-22.
-- This migration updates only process GC in product_standards and its active version.

START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS tmp_gc_standard_20260922;
CREATE TEMPORARY TABLE tmp_gc_standard_20260922 (
  product_code VARCHAR(180) NOT NULL PRIMARY KEY,
  standard_output DECIMAL(18,6) NOT NULL
);

INSERT INTO tmp_gc_standard_20260922 (product_code, standard_output) VALUES
('123',320),('125',280),('127',500),('1080',660),('1090',660),
('1657',90),('1660',90),('2168',600),('2801',605),('3880',400),
('5770',605),('6270',605),('6773',120),('7133',605),('7236',690),
('7630',180),('8014',550),('8052',36),('8234',660),('8235',660),
('8484',540),('8485',570),('9116',300),('9140',500),('9149',360),
('9276',500),('9477',605),('9740',420),('9968',605),('15u-l',180),
('15u-t',180),('16h',250),('2SS',400),('6486-m',1400),('6487-l',470),
('6488-l',470),('6490-l',470),('6492-m',1450),('6494-m',1450),
('6495-m',1450),('8um',350),('8uy',250),('8W6',335),('9295-l',180),
('9295-t',180),('c1080',1800),('c1090',2000),('c129',3105),('c1432',800),
('c2556-auto',5000),('C3301',850),('c5770-auto',6660),('c6485',1525),
('c6486',1625),('c6487',1525),('c6488',1525),('c6490',1525),
('c6492',1625),('c6493',1625),('c6494',1625),('c6495',1625),
('c7630',5000),('c8234',2400),('C8235',2400),('c8484',2400),
('c8um',2415),('CD008UY',850),('CD02N23',900),('cgyx-auto',6000),
('check 6488',1100),('check 6490',1100),('D02N23',120),('d02n3c',335),
('d02n3f',335),('gfm',510),('kcn',550),('kct',335),('pk',335),('977',300),
('check 2801',1200),('df',660),('ld6773',300),('ld7630',300),('LD8014',1300),
('LD9140',1300),('ld9149',480),('LDGFM',1300),('575',160),('LTX',840);

-- Upsert the canonical GC master rows. Process is resolved by process_code,
-- so this does not depend on a hard-coded process id.
INSERT INTO product_standards
    (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, 'GC', s.product_code, s.standard_output, 0, 'active'
FROM tmp_gc_standard_20260922 s
JOIN processes p ON UPPER(TRIM(p.process_code)) = 'GC'
 AND COALESCE(p.status, 'active') IN ('active','enabled','1')
ON DUPLICATE KEY UPDATE
    work_type = 'GC',
    standard_output = VALUES(standard_output),
    status = 'active';

-- Keep an active version for each canonical GC standard. If an active version
-- already exists, update it rather than creating duplicates.
UPDATE product_standard_versions v
JOIN processes p ON p.id = v.process_id
JOIN tmp_gc_standard_20260922 s ON s.product_code = v.product_code
SET v.standard_output = s.standard_output,
    v.status = 'active'
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND v.status = 'active';

INSERT INTO product_standard_versions
    (process_id, product_code, standard_output, exclude_kqd_from_tt, version_no, effective_from, effective_to, status)
SELECT p.id, s.product_code, s.standard_output, 0,
       COALESCE((SELECT MAX(v2.version_no) + 1
                   FROM product_standard_versions v2
                  WHERE v2.process_id = p.id
                    AND v2.product_code = s.product_code), 1),
       CURRENT_DATE, NULL, 'active'
FROM tmp_gc_standard_20260922 s
JOIN processes p ON UPPER(TRIM(p.process_code)) = 'GC'
 AND COALESCE(p.status, 'active') IN ('active','enabled','1')
WHERE NOT EXISTS (
  SELECT 1 FROM product_standard_versions v
  WHERE v.process_id = p.id
    AND v.product_code = s.product_code
    AND v.status = 'active'
);

DROP TEMPORARY TABLE tmp_gc_standard_20260922;
COMMIT;
