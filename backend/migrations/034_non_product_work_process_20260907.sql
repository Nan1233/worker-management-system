-- Experimental process for workers whose duties have no product-code productivity.
-- Examples: Xuất, Nhập, Hỗ trợ, vệ sinh/kho and other time-based duties.
-- No fake product code is created.

INSERT INTO processes (id, process_code, process_name, description, status)
VALUES (
  60006,
  'CVK',
  'Công việc khác - Không theo mã sản phẩm',
  'Ghi nhận thời gian cho Xuất/Nhập/Hỗ trợ và các công việc không phát sinh thực tích theo mã sản phẩm.',
  'active'
)
ON DUPLICATE KEY UPDATE
  process_code = VALUES(process_code),
  process_name = VALUES(process_name),
  description = VALUES(description),
  status = VALUES(status);
