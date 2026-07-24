ALTER TABLE machines
ADD COLUMN exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0
COMMENT '0: tính KQD vào TT; 1: không tính KQD vào TT';
