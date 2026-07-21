-- KTC Gia công demo seed
-- Password mặc định cho tài khoản công nhân: 123456
SET NAMES utf8mb4;
START TRANSACTION;

INSERT INTO processes (process_code, process_name, description, status)
VALUES ('GC','Gia công','Cắt và lồng sản phẩm','active')
ON DUPLICATE KEY UPDATE process_name=VALUES(process_name), description=VALUES(description), status='active';

INSERT INTO users (username,password,full_name,role,status) VALUES ('599','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','An Thị Thanh Phương','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'599','Sản xuất','Công nhân',100,'active' FROM users WHERE username='599' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('1246','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Nguyễn Quang Tuấn','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'1246','Sản xuất','Công nhân',100,'active' FROM users WHERE username='1246' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('1333','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Hoàng Thị Thư','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'1333','Sản xuất','Công nhân',100,'active' FROM users WHERE username='1333' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('1476','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Đào Thị Phương','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'1476','Sản xuất','Công nhân',100,'active' FROM users WHERE username='1476' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('1541','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Hoàng Quang Vinh','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'1541','Sản xuất','Công nhân',100,'active' FROM users WHERE username='1541' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('1845','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Nguyễn Thị Vân','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'1845','Sản xuất','Công nhân',100,'active' FROM users WHERE username='1845' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('1850','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Lê Thị Gấm','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'1850','Sản xuất','Công nhân',100,'active' FROM users WHERE username='1850' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('2009','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Cao Thị Thu','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'2009','Sản xuất','Công nhân',100,'active' FROM users WHERE username='2009' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('2278','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Sa Thị Ương','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'2278','Sản xuất','Công nhân',100,'active' FROM users WHERE username='2278' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('2374','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Nguyễn Thị Cẩm Tiên','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'2374','Sản xuất','Công nhân',100,'active' FROM users WHERE username='2374' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('2564','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Đinh Phuơng Thảo','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'2564','Sản xuất','Công nhân',100,'active' FROM users WHERE username='2564' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('2865','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Vì Thị Thiếu','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'2865','Sản xuất','Công nhân',100,'active' FROM users WHERE username='2865' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('2959','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Mùi Văn Chường','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'2959','Sản xuất','Công nhân',100,'active' FROM users WHERE username='2959' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3244','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Đinh Văn Biên','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3244','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3244' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3268','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Điêu Chính Huynh','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3268','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3268' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3277','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Vì Thị Liệu','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3277','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3277' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3295','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Đinh Thị Nhi','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3295','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3295' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3349','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Đinh Văn Bằng','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3349','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3349' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3351','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Đinh Thị Hà','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3351','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3351' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3590','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Xồng Bá Lông','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3590','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3590' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3605','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Đào Thị Hồng','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3605','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3605' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3606','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Đỗ Thùy Dương','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3606','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3606' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3607','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Tô Thị Thao','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3607','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3607' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3638','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Vì Thị Tuyết','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3638','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3638' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3653','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Mùi Thị Yên','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3653','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3653' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3715','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Hoàng Văn Thoản','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3715','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3715' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3752','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Lò Thị Oanh','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3752','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3752' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3832','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Đinh Tiến Khương','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3832','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3832' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3834','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Hà Văn Phan','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3834','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3834' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3840','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Hà Văn Huy','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3840','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3840' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3862','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Lò Thị Hà','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3862','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3862' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3888','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Vì Xuân Bắc','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3888','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3888' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3892','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Hoàng Việt Hùng','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3892','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3892' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3901','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Lý Thị Bọng','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3901','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3901' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3919','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Bùi Văn Nhượng','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3919','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3919' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3922','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Lường Văn Hải','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3922','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3922' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3930','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Hoàng Thị Hậu','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3930','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3930' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3960','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Quàng Thị Niên','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3960','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3960' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3964','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Ma Văn Sinh','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3964','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3964' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3968','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Nguyễn Thị Hải Yến','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3968','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3968' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('3971','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Nguyễn Thị Hoài Vinh','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'3971','Sản xuất','Công nhân',100,'active' FROM users WHERE username='3971' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4017','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Đinh Thị Nga','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4017','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4017' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4019','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Đinh Văn Lưu','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4019','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4019' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4033','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Vì Thị Loan','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4033','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4033' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4039','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Hà Thị Thủy','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4039','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4039' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4041','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Hà Phương Lan','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4041','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4041' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4058','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Mùi Văn Trường','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4058','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4058' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4079','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Cao Minh Tuấn','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4079','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4079' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4083','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Phạm Thị Hợp','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4083','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4083' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4093','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Lò Thị Nguyên','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4093','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4093' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4096','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Đinh Thị Vứng','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4096','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4096' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4102','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Lò Thị Ngọc Lan','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4102','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4102' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4110','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Lường Văn Huyên','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4110','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4110' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4114','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Nông Thị Thúy','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4114','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4114' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4117','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Vì Thị Lam','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4117','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4117' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4152','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Sùng Mí Mua','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4152','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4152' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4162','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Cà Thị Viết','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4162','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4162' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4164','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Vừ Y Bi','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4164','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4164' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4166','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Vì Tùng Dương','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4166','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4166' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4173','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Mùi Văn Thanh','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4173','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4173' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4185','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Vàng Văn Hạnh','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4185','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4185' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4197','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Quách Thị Ninh','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4197','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4197' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4219','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Bàn Thị Thu','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4219','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4219' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4220','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Lừ Thị Thảo','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4220','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4220' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4335','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Cầm Thị Viến','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4335','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4335' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('2625','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Ma THị Bình SXC','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'2625','Sản xuất','Công nhân',100,'active' FROM users WHERE username='2625' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4342','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Mùi Văn Vặt','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4342','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4342' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4317','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Nhâm CĐ','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4317','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4317' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4318','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Tuấn CĐ','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4318','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4318' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4344','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Mùi Văn Lâm','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4344','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4344' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4351','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Vì Thị Huệ','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4351','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4351' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4352','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Đinh THị Vân','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4352','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4352' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4353','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Tòng Văn Cầm','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4353','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4353' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('4360','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Xồng Y hiền','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'4360','Sản xuất','Công nhân',100,'active' FROM users WHERE username='4360' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';
INSERT INTO users (username,password,full_name,role,status) VALUES ('1448','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Lê Thị Dung','worker','active') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role='worker', status='active';
INSERT INTO workers (user_id,worker_code,department,position,training_percent,status) SELECT id,'1448','Sản xuất','Công nhân',100,'active' FROM users WHERE username='1448' ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code), department='Sản xuất', position='Công nhân', training_percent=100, status='active';

INSERT IGNORE INTO worker_processes (worker_id,process_id)
SELECT w.id,p.id FROM workers w JOIN processes p ON p.process_code='GC'
WHERE w.worker_code IN ('599','1246','1333','1476','1541','1845','1850','2009','2278','2374','2564','2865','2959','3244','3268','3277','3295','3349','3351','3590','3605','3606','3607','3638','3653','3715','3752','3832','3834','3840','3862','3888','3892','3901','3919','3922','3930','3960','3964','3968','3971','4017','4019','4033','4039','4041','4058','4079','4083','4093','4096','4102','4110','4114','4117','4152','4162','4164','4166','4173','4185','4197','4219','4220','4335','2625','4342','4317','4318','4344','4351','4352','4353','4360','1448');

INSERT INTO machines (process_id,machine_code,machine_name,status)
SELECT p.id, src.machine_code, src.machine_name, 'active' FROM processes p JOIN (
  SELECT 'c2556-2' machine_code, 'Máy c2556-2' machine_name UNION ALL
  SELECT 'c2556-11' machine_code, 'Máy c2556-11' machine_name UNION ALL
  SELECT 'c2556-8' machine_code, 'Máy c2556-8' machine_name UNION ALL
  SELECT 'c2556-9' machine_code, 'Máy c2556-9' machine_name UNION ALL
  SELECT 'C2556-auto' machine_code, 'Máy C2556-auto' machine_name UNION ALL
  SELECT 'c2821' machine_code, 'Máy c2821' machine_name UNION ALL
  SELECT 'c2822' machine_code, 'Máy c2822' machine_name UNION ALL
  SELECT 'c8484' machine_code, 'Máy c8484' machine_name UNION ALL
  SELECT 'c8485' machine_code, 'Máy c8485' machine_name UNION ALL
  SELECT 'c3880-2' machine_code, 'Máy c3880-2' machine_name UNION ALL
  SELECT 'c0977' machine_code, 'Máy c0977' machine_name UNION ALL
  SELECT 'c3880-8' machine_code, 'Máy c3880-8' machine_name UNION ALL
  SELECT 'c3880-9' machine_code, 'Máy c3880-9' machine_name UNION ALL
  SELECT 'c9149' machine_code, 'Máy c9149' machine_name UNION ALL
  SELECT 'c0575' machine_code, 'Máy c0575' machine_name UNION ALL
  SELECT 'c3438' machine_code, 'Máy c3438' machine_name UNION ALL
  SELECT 'c1080' machine_code, 'Máy c1080' machine_name UNION ALL
  SELECT 'c1090' machine_code, 'Máy c1090' machine_name UNION ALL
  SELECT 'c1657' machine_code, 'Máy c1657' machine_name UNION ALL
  SELECT 'c5770-9' machine_code, 'Máy c5770-9' machine_name UNION ALL
  SELECT 'c7630' machine_code, 'Máy c7630' machine_name UNION ALL
  SELECT 'c5770' machine_code, 'Máy c5770' machine_name UNION ALL
  SELECT 'c8052' machine_code, 'Máy c8052' machine_name UNION ALL
  SELECT 'C5770-1' machine_code, 'Máy C5770-1' machine_name UNION ALL
  SELECT 'c8234' machine_code, 'Máy c8234' machine_name UNION ALL
  SELECT 'c8235' machine_code, 'Máy c8235' machine_name UNION ALL
  SELECT 'c6773' machine_code, 'Máy c6773' machine_name UNION ALL
  SELECT '5243-l' machine_code, 'Máy 5243-l' machine_name UNION ALL
  SELECT 'cpk-r' machine_code, 'Máy cpk-r' machine_name UNION ALL
  SELECT 'c125' machine_code, 'Máy c125' machine_name UNION ALL
  SELECT 'c7236' machine_code, 'Máy c7236' machine_name UNION ALL
  SELECT 'c2453' machine_code, 'Máy c2453' machine_name UNION ALL
  SELECT 'c79c' machine_code, 'Máy c79c' machine_name UNION ALL
  SELECT 'c79c-3' machine_code, 'Máy c79c-3' machine_name UNION ALL
  SELECT 'cdk1' machine_code, 'Máy cdk1' machine_name UNION ALL
  SELECT 'c4268' machine_code, 'Máy c4268' machine_name UNION ALL
  SELECT 'c8016' machine_code, 'Máy c8016' machine_name UNION ALL
  SELECT 'c129' machine_code, 'Máy c129' machine_name UNION ALL
  SELECT 'c9118' machine_code, 'Máy c9118' machine_name UNION ALL
  SELECT 'c9142' machine_code, 'Máy c9142' machine_name UNION ALL
  SELECT 'c7236-2' machine_code, 'Máy c7236-2' machine_name UNION ALL
  SELECT 'c1432' machine_code, 'Máy c1432' machine_name UNION ALL
  SELECT 'c4268-3' machine_code, 'Máy c4268-3' machine_name UNION ALL
  SELECT 'C129-13' machine_code, 'Máy C129-13' machine_name UNION ALL
  SELECT 'c8um' machine_code, 'Máy c8um' machine_name UNION ALL
  SELECT 'c9118-13' machine_code, 'Máy c9118-13' machine_name UNION ALL
  SELECT 'c8um-3' machine_code, 'Máy c8um-3' machine_name UNION ALL
  SELECT 'ckcn' machine_code, 'Máy ckcn' machine_name UNION ALL
  SELECT 'cd027u8' machine_code, 'Máy cd027u8' machine_name UNION ALL
  SELECT 'C8016-12' machine_code, 'Máy C8016-12' machine_name UNION ALL
  SELECT 'c8um-t' machine_code, 'Máy c8um-t' machine_name UNION ALL
  SELECT 'c8uy' machine_code, 'Máy c8uy' machine_name UNION ALL
  SELECT 'c2401' machine_code, 'Máy c2401' machine_name UNION ALL
  SELECT 'c2411' machine_code, 'Máy c2411' machine_name UNION ALL
  SELECT 'c3301' machine_code, 'Máy c3301' machine_name UNION ALL
  SELECT 'CD02N23' machine_code, 'Máy CD02N23' machine_name UNION ALL
  SELECT 'CD02N3C' machine_code, 'Máy CD02N3C' machine_name UNION ALL
  SELECT 'CD02N3F' machine_code, 'Máy CD02N3F' machine_name
) src WHERE p.process_code='GC'
ON DUPLICATE KEY UPDATE machine_name=VALUES(machine_name), status='active';

INSERT INTO product_standards (process_id,work_type,product_code,standard_output,status)
SELECT p.id, src.work_type, src.product_code, src.standard_output, 'active' FROM processes p JOIN (
  SELECT 'Cắt' work_type, 'c2556-2' product_code, 7200 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c2556-11' product_code, 6600 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c2556-8' product_code, 5600 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c2556-9' product_code, 5000 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'C2556-auto' product_code, 5000 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c2821' product_code, 2400 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c2822' product_code, 2400 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c8484' product_code, 2400 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c8485' product_code, 2400 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c3880-2' product_code, 7200 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c0977' product_code, 1460 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c3880-8' product_code, 5600 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c3880-9' product_code, 5000 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c9149' product_code, 6000 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c0575' product_code, 1460 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c3438' product_code, 2600 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c1080' product_code, 1800 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c1090' product_code, 2000 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c1657' product_code, 2600 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c5770-9' product_code, 6400 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c7630' product_code, 5000 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c5770' product_code, 8000 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c8052' product_code, 5800 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'C5770-1' product_code, 4800 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c8234' product_code, 2400 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c8235' product_code, 2400 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c6773' product_code, 4000 standard_output UNION ALL
  SELECT 'Cắt' work_type, '5243-l' product_code, 182 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'cpk-r' product_code, 2415 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c125' product_code, 2106 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c7236' product_code, 900 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c2453' product_code, 2130 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c79c' product_code, 2415 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c79c-3' product_code, 3066 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'cdk1' product_code, 2415 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c4268' product_code, 2415 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c8016' product_code, 4088 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c129' product_code, 3105 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c9118' product_code, 2800 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c9142' product_code, 4088 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c7236-2' product_code, 500 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c1432' product_code, 800 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c4268-3' product_code, 2715 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'C129-13' product_code, 2415 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c8um' product_code, 2415 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c9118-13' product_code, 2415 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c8um-3' product_code, 2415 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'ckcn' product_code, 2250 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'cd027u8' product_code, 1440 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'C8016-12' product_code, 3220 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c8um-t' product_code, 1610 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c8uy' product_code, 850 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c2401' product_code, 1440 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c2411' product_code, 850 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'c3301' product_code, 850 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'CD02N23' product_code, 900 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'CD02N3C' product_code, 2415 standard_output UNION ALL
  SELECT 'Cắt' work_type, 'CD02N3F' product_code, 2415 standard_output UNION ALL
  SELECT 'Lồng' work_type, '9740' product_code, 420 standard_output UNION ALL
  SELECT 'Lồng' work_type, '2801' product_code, 605 standard_output UNION ALL
  SELECT 'Lồng' work_type, '6262' product_code, 420 standard_output UNION ALL
  SELECT 'Lồng' work_type, '598' product_code, 420 standard_output UNION ALL
  SELECT 'Lồng' work_type, '7133' product_code, 605 standard_output UNION ALL
  SELECT 'Lồng' work_type, '8484' product_code, 540 standard_output UNION ALL
  SELECT 'Lồng' work_type, '8485' product_code, 570 standard_output UNION ALL
  SELECT 'Lồng' work_type, '4563' product_code, 605 standard_output UNION ALL
  SELECT 'Lồng' work_type, '3880' product_code, 400 standard_output UNION ALL
  SELECT 'Lồng' work_type, '7960' product_code, 300 standard_output UNION ALL
  SELECT 'Lồng' work_type, '9149' product_code, 360 standard_output UNION ALL
  SELECT 'Lồng' work_type, '575' product_code, 300 standard_output UNION ALL
  SELECT 'Lồng' work_type, '3438' product_code, 420 standard_output UNION ALL
  SELECT 'Lồng' work_type, '1080' product_code, 660 standard_output UNION ALL
  SELECT 'Lồng' work_type, '1090' product_code, 660 standard_output UNION ALL
  SELECT 'Lồng' work_type, '1657' product_code, 90 standard_output UNION ALL
  SELECT 'Lồng' work_type, '1660' product_code, 90 standard_output UNION ALL
  SELECT 'Lồng' work_type, '7630' product_code, 180 standard_output UNION ALL
  SELECT 'Lồng' work_type, '5770-T' product_code, 420 standard_output UNION ALL
  SELECT 'Lồng' work_type, '5861' product_code, 605 standard_output UNION ALL
  SELECT 'Lồng' work_type, '9565' product_code, 200 standard_output UNION ALL
  SELECT 'Lồng' work_type, '8234' product_code, 660 standard_output UNION ALL
  SELECT 'Lồng' work_type, '8235' product_code, 660 standard_output UNION ALL
  SELECT 'Lồng' work_type, '6773' product_code, 120 standard_output UNION ALL
  SELECT 'Lồng' work_type, '8052' product_code, 36 standard_output UNION ALL
  SELECT 'Lồng' work_type, '4408-T' product_code, 162 standard_output UNION ALL
  SELECT 'Lồng' work_type, '4408-L' product_code, 162 standard_output UNION ALL
  SELECT 'Lồng' work_type, '5243' product_code, 615 standard_output UNION ALL
  SELECT 'Lồng' work_type, '123' product_code, 320 standard_output UNION ALL
  SELECT 'Lồng' work_type, '125' product_code, 280 standard_output UNION ALL
  SELECT 'Lồng' work_type, '7236' product_code, 690 standard_output UNION ALL
  SELECT 'Lồng' work_type, '2168' product_code, 600 standard_output UNION ALL
  SELECT 'Lồng' work_type, '2173' product_code, 600 standard_output UNION ALL
  SELECT 'Lồng' work_type, 'D02N3C' product_code, 335 standard_output UNION ALL
  SELECT 'Lồng' work_type, 'D02N3F' product_code, 335 standard_output UNION ALL
  SELECT 'Lồng' work_type, '4258' product_code, 335 standard_output UNION ALL
  SELECT 'Lồng' work_type, '8014' product_code, 550 standard_output UNION ALL
  SELECT 'Lồng' work_type, '127' product_code, 500 standard_output UNION ALL
  SELECT 'Lồng' work_type, '9116' product_code, 300 standard_output UNION ALL
  SELECT 'Lồng' work_type, '9140' product_code, 500 standard_output UNION ALL
  SELECT 'Lồng' work_type, '9276' product_code, 500 standard_output UNION ALL
  SELECT 'Lồng' work_type, 'd0049' product_code, 430 standard_output UNION ALL
  SELECT 'Lồng' work_type, '8w6' product_code, 335 standard_output UNION ALL
  SELECT 'Lồng' work_type, 'gfm' product_code, 510 standard_output UNION ALL
  SELECT 'Lồng' work_type, 'd49' product_code, 355 standard_output UNION ALL
  SELECT 'Lồng' work_type, '15u-l' product_code, 180 standard_output UNION ALL
  SELECT 'Lồng' work_type, '8011' product_code, 200 standard_output UNION ALL
  SELECT 'Lồng' work_type, '1432-kt' product_code, 600 standard_output UNION ALL
  SELECT 'Lồng' work_type, '15u-t' product_code, 180 standard_output UNION ALL
  SELECT 'Lồng' work_type, 'd02n23' product_code, 120 standard_output UNION ALL
  SELECT 'Lồng' work_type, '6001' product_code, 160 standard_output UNION ALL
  SELECT 'Lồng' work_type, '2ss' product_code, 400 standard_output UNION ALL
  SELECT 'Lồng' work_type, '9140-3' product_code, 350 standard_output UNION ALL
  SELECT 'Lồng' work_type, '6e' product_code, 160 standard_output UNION ALL
  SELECT 'Lồng' work_type, '16h' product_code, 250 standard_output UNION ALL
  SELECT 'Lồng' work_type, '8uy' product_code, 250 standard_output
) src WHERE p.process_code='GC'
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), status='active';

COMMIT;

-- Kiểm tra
SELECT COUNT(*) AS workers_gia_cong FROM worker_processes wp JOIN processes p ON p.id=wp.process_id WHERE p.process_code='GC';
SELECT work_type,COUNT(*) total FROM product_standards ps JOIN processes p ON p.id=ps.process_id WHERE p.process_code='GC' GROUP BY work_type;
SELECT COUNT(*) AS machines_gia_cong FROM machines m JOIN processes p ON p.id=m.process_id WHERE p.process_code='GC';