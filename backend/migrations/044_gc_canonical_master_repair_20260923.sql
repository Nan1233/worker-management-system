-- KTC 044: final canonical GC master repair for TEST.
-- Cloudflare/TiDB migration runner: avoid session variables, transactions,
-- repeated scalar subqueries and verification queries that amplify subrequests.

DROP TEMPORARY TABLE IF EXISTS tmp_gc_canonical_20260923;
CREATE TEMPORARY TABLE tmp_gc_canonical_20260923 (
  product_code VARCHAR(180) NOT NULL PRIMARY KEY,
  standard_output DECIMAL(18,6) NOT NULL
);

INSERT INTO tmp_gc_canonical_20260923 (product_code, standard_output) VALUES
('123',320),('125',280),('127',500),('1080',660),('1090',660),('1657',90),('1660',90),('2168',600),('2801',605),('3880',400),('5770',605),('6270',605),('6773',120),('7133',605),('7236',690),('7630',180),('8014',550),('8052',36),('8234',660),('8235',660),('8484',540),('8485',570),('9116',300),('9140',500),('9149',360),('9276',500),('9477',605),('9740',420),('9968',605),('15u-l',180),('15u-t',180),('16h',250),('2SS',400),('6486-m',1400),('6487-l',470),('6488-l',470),('6490-l',470),('6492-m',1450),('6494-m',1450),('6495-m',1450),('8um',350),('8uy',250),('8W6',335),('9295-l',180),('9295-t',180),('c1080',1800),('c1090',2000),('c129',3105),('c1432',800),('c2556-auto',5000),('C3301',850),('c5770-auto',6660),('c6485',1525),('c6486',1625),('c6487',1525),('c6488',1525),('c6490',1525),('c6492',1625),('c6493',1625),('c6494',1625),('c6495',1625),('c7630',5000),('c8234',2400),('C8235',2400),('c8484',2400),('c8um',2415),('CD008UY',850),('CD02N23',900),('cgyx-auto',6000),('check 6488',1100),('check 6490',1100),('D02N23',120),('d02n3c',335),('d02n3f',335),('gfm',510),('kcn',550),('kct',335),('pk',335),('977',300),('check 2801',1200),('df',660),('ld6773',300),('ld7630',300),('LD8014',1300),('LD9140',1300),('ld9149',480),('LDGFM',1300),('575',160),('LTX',840);

-- Deactivate old active GC standards outside the canonical master.
UPDATE product_standards ps
JOIN processes p ON p.id = ps.process_id
LEFT JOIN tmp_gc_canonical_20260923 c ON c.product_code = ps.product_code
SET ps.status = 'inactive'
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND ps.status = 'active'
  AND c.product_code IS NULL;

-- Update existing canonical GC standards.
UPDATE product_standards ps
JOIN processes p ON p.id = ps.process_id
JOIN tmp_gc_canonical_20260923 c ON c.product_code = ps.product_code
SET ps.standard_output = c.standard_output,
    ps.status = 'active'
WHERE UPPER(TRIM(p.process_code)) = 'GC';

-- Insert missing canonical GC standards without scalar subqueries.
INSERT INTO product_standards
  (process_id, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, c.product_code, c.standard_output, 0, 'active'
FROM processes p
JOIN tmp_gc_canonical_20260923 c
LEFT JOIN product_standards ps
  ON ps.process_id = p.id
 AND ps.product_code = c.product_code
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND ps.id IS NULL;

-- Keep one active row per canonical product.
UPDATE product_standards ps
JOIN processes p ON p.id = ps.process_id
JOIN (
  SELECT process_id, product_code, MIN(id) AS keep_id
  FROM product_standards
  GROUP BY process_id, product_code
) k ON k.process_id = ps.process_id AND k.product_code = ps.product_code
JOIN tmp_gc_canonical_20260923 c ON c.product_code = ps.product_code
SET ps.status = CASE WHEN ps.id = k.keep_id THEN 'active' ELSE 'inactive' END
WHERE UPPER(TRIM(p.process_code)) = 'GC';

-- Apply canonical values to existing versioned GC standards.
UPDATE product_standard_versions v
JOIN processes p ON p.id = v.process_id
JOIN tmp_gc_canonical_20260923 c ON c.product_code = v.product_code
SET v.standard_output = c.standard_output,
    v.status = 'active'
WHERE UPPER(TRIM(p.process_code)) = 'GC';

-- Deactivate versioned GC standards outside the canonical master.
UPDATE product_standard_versions v
JOIN processes p ON p.id = v.process_id
LEFT JOIN tmp_gc_canonical_20260923 c ON c.product_code = v.product_code
SET v.status = 'inactive'
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND v.status = 'active'
  AND c.product_code IS NULL;

-- Add missing active version rows. Version number is fixed at 1 for a new
-- canonical row; existing rows are handled by the update above.
INSERT INTO product_standard_versions
  (process_id, product_code, standard_output, exclude_kqd_from_tt,
   version_no, effective_from, effective_to, status)
SELECT p.id, c.product_code, c.standard_output, 0,
       1, CURRENT_DATE, NULL, 'active'
FROM processes p
JOIN tmp_gc_canonical_20260923 c
LEFT JOIN product_standard_versions v
  ON v.process_id = p.id
 AND v.product_code = c.product_code
 AND v.status = 'active'
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND v.id IS NULL;

DROP TEMPORARY TABLE tmp_gc_canonical_20260923;
