-- KTC TEST reset: rebuild the Gia công Cắt/Lồng assignment master from the
-- canonical roster already established by 045_gc_worker_canonical_slug.
-- Historical production reports are preserved. This only rebuilds current
-- process assignments and active GC machine master rows.

SET @gc_process_id := (SELECT id FROM processes WHERE UPPER(TRIM(process_code))='GC' LIMIT 1);

-- Remove every current Cắt/Lồng (GC) worker assignment first. Do not delete
-- users/workers globally because historical reports may reference them.
DELETE FROM worker_processes WHERE process_id=@gc_process_id;

-- Canonical worker roster from the Excel-derived GC master.
INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, @gc_process_id
FROM workers w
WHERE @gc_process_id IS NOT NULL
  AND LOWER(TRIM(w.worker_code)) IN (
    '1448','2959','3268','3277','4173','4185','4344','4382','4360','4478',
    '4412','4310','vi-van-long','761','846','669','676','766','959','2284',
    '2649','2890','3111','3959','4325','4418','4456','4504','655','656',
    'giang-a-vong','1246','3751','1733','2865','3919','4017','4019','4110',
    '4335','4342','4352','4384','4496','4489','4490','848','t-551','666',
    '692','947','849','850','vu-a-tria','giang-thi-lua','2516','3352','3353',
    '3526','4031','3187','698','834','845','vu-a-denh','vang-thi-bong','1777',
    '958','49cdt-046','49cdt-049','49cdt-050','49cdt-052','49cdt-055','49cdt-056',
    '49cdt-059','49cdt-064','49cdt-065','49cdt-073','49ck-076','49ck-078',
    '49ck-084','49dl1-025','49dl1-026','49dl1-027','49dl1-028','49dl1-030',
    '49dl1-032','49dl1-038','49dl1-040','49dl1-042','49dl1-044','49dllh1-001',
    '49dllh1-002','49dllh1-014','49dllh1-015','49dllh1-022'
  );

-- Re-activate the canonical GC machine master used by Cắt/Lồng.
UPDATE machines
SET status='active'
WHERE process_id=@gc_process_id
  AND LOWER(TRIM(machine_code)) IN (
    'c1','c2','c3','c4','c5','c6','c7','c8','c9','c10','c11','c12',
    'ml1','ml2','ml3','ml4','ml5','ml6','ml7','ml8','ml9','ml10',
    'ml11','ml12','ml13','ml14','ml15','ml16','ml17','ml18','ml19','ml20'
  );

-- If an old machine row exists only as inactive, the INSERT IGNORE below
-- restores the canonical machine without touching unrelated processes.
INSERT IGNORE INTO machines
(process_id,machine_code,machine_name,is_automatic,max_workers_per_machine,status)
VALUES
(@gc_process_id,'C1','Máy cắt số 1',0,1,'active'),
(@gc_process_id,'C2','Máy cắt số 2',0,1,'active'),
(@gc_process_id,'C3','Máy cắt số 3',0,1,'active'),
(@gc_process_id,'C4','Máy cắt số 4',0,1,'active'),
(@gc_process_id,'C5','Máy cắt số 5',0,1,'active'),
(@gc_process_id,'C6','Máy cắt số 6',0,1,'active'),
(@gc_process_id,'C7','Máy cắt số 7',0,1,'active'),
(@gc_process_id,'C8','Máy cắt số 8',0,1,'active'),
(@gc_process_id,'C9','Máy cắt số 9',0,1,'active'),
(@gc_process_id,'C10','Máy cắt số 10',0,1,'active'),
(@gc_process_id,'C11','Máy cắt số 11',0,1,'active'),
(@gc_process_id,'C12','Máy cắt số 12',0,1,'active'),
(@gc_process_id,'ML1','Máy lồng số 1',0,4,'active'),
(@gc_process_id,'ML2','Máy lồng số 2',0,4,'active'),
(@gc_process_id,'ML3','Máy lồng số 3',0,4,'active'),
(@gc_process_id,'ML4','Máy lồng số 4',0,4,'active'),
(@gc_process_id,'ML5','Máy lồng số 5',0,4,'active'),
(@gc_process_id,'ML6','Máy lồng số 6',0,4,'active'),
(@gc_process_id,'ML7','Máy lồng số 7',0,4,'active'),
(@gc_process_id,'ML8','Máy lồng số 8',0,4,'active'),
(@gc_process_id,'ML9','Máy lồng số 9',0,4,'active'),
(@gc_process_id,'ML10','Máy lồng số 10',0,4,'active'),
(@gc_process_id,'ML11','Máy lồng số 11',0,4,'active'),
(@gc_process_id,'ML12','Máy lồng số 12',0,4,'active'),
(@gc_process_id,'ML13','Máy lồng số 13',0,4,'active'),
(@gc_process_id,'ML14','Máy lồng số 14',0,4,'active'),
(@gc_process_id,'ML15','Máy lồng số 15',0,4,'active'),
(@gc_process_id,'ML16','Máy lồng số 16',0,4,'active'),
(@gc_process_id,'ML17','Máy lồng số 17',0,4,'active'),
(@gc_process_id,'ML18','Máy lồng số 18',0,4,'active'),
(@gc_process_id,'ML19','Máy lồng số 19',0,4,'active'),
(@gc_process_id,'ML20','Máy lồng số 20',0,4,'active');
