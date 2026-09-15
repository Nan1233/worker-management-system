-- TEST ONLY: exact 19 Gia công NG master. Historical report data is not rewritten.
SET @gc_process_id := (SELECT id FROM processes WHERE UPPER(TRIM(process_code))='GC' ORDER BY id LIMIT 1);
CREATE TEMPORARY TABLE tmp_gc_19 (defect_code VARCHAR(100) PRIMARY KEY, defect_name VARCHAR(255) NOT NULL, sort_order INT NOT NULL);
INSERT INTO tmp_gc_19 VALUES
('KQD','KQD',1),('VO_CAO_SU','Vỡ cao su',2),('K_XUOC_CONG_GAY','K xước cong gãy',3),('CAO_SU_XOAY','Cao su xoay',4),('CAT_KHONG_DUT','Cắt không đứt',5),('BAVIA','Bavia',6),('CSH','CSH',7),('PPCM','ppcm',8),('KT_LON','KT lớn',9),('KT_NHO','KT nhỏ',10),('LCS','LCS',11),('CAT_LEM','cắt lẹm',12),('RACH_NVL','rách nvl',13),('CHAN_NGAN_DAI','Chân ngắn dài',14),('SOT_VIA','sót via',15),('FURE_TRUC','fure trục',16),('LAN_CS','lẫn cs',17),('BAVIA_CAT_HUT','bavia cắt hụt',18),('THIEU_CAO_SU','thiếu cao su',19);
UPDATE defect_types d LEFT JOIN tmp_gc_19 v ON UPPER(TRIM(d.defect_code))=UPPER(TRIM(v.defect_code)) SET d.status=IF(v.defect_code IS NULL,'inactive','active'), d.defect_name=COALESCE(v.defect_name,d.defect_name), d.sort_order=COALESCE(v.sort_order,d.sort_order) WHERE d.process_id=@gc_process_id;
INSERT INTO defect_types(process_id,defect_code,defect_name,sort_order,status) SELECT @gc_process_id,v.defect_code,v.defect_name,v.sort_order,'active' FROM tmp_gc_19 v WHERE NOT EXISTS (SELECT 1 FROM defect_types d WHERE d.process_id=@gc_process_id AND UPPER(TRIM(d.defect_code))=UPPER(TRIM(v.defect_code)));
SELECT COUNT(*) AS active_gc_defect_count FROM defect_types WHERE process_id=@gc_process_id AND status='active';
SELECT id,defect_code,defect_name,sort_order,status FROM defect_types WHERE process_id=@gc_process_id AND status='active' ORDER BY sort_order,id;
DROP TEMPORARY TABLE tmp_gc_19;
