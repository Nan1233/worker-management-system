# KTC – Kế hoạch Backup & Phục hồi

## Mục tiêu
- DB là nguồn sự thật; Excel là lớp báo cáo/chỉnh sửa có kiểm soát.
- Không phụ thuộc ổ đĩa tạm của Render.
- Có thể xác minh backup trước khi cần restore.
- Không tự động xóa/ghi đè dữ liệu production trong quá trình restore.

## 1. Ba lớp bảo vệ

### Lớp A – TiDB / nhà cung cấp
Nếu gói TiDB Cloud hiện dùng có snapshot/PITR, bật và giữ theo chính sách doanh nghiệp. Đây là lớp phục hồi hạ tầng, độc lập với ứng dụng.

### Lớp B – Logical backup của ứng dụng
Chạy từ máy quản trị bảo mật có file `backend/.env` và truy cập được TiDB:

```cmd
cd /d C:\VSCode\worker-management-system
npm run backup:db
```

Mặc định file được ghi vào:
`%USERPROFILE%\Documents\KTC\Backup\Database`

Nên đặt `KTC_BACKUP_ENCRYPTION_KEY` trên máy backup. Khi có khóa, backup dùng AES-256-GCM và tạo:
- `ktc-db-YYYYMMDD-HHmmss.jsonl.gz.enc`
- `.sha256`
- `.manifest.json`
- `.crypto.json` (salt/IV/auth tag, không chứa khóa)

Nếu không đặt khóa, script vẫn chạy nhưng cảnh báo và tạo `.jsonl.gz` không mã hóa.

Backup chạy trong một transaction snapshot nhất quán, đọc từng chunk để không nạp toàn DB vào RAM.

Retention tự động:
- 14 bản ngày
- 8 bản tuần
- 12 bản tháng

Có thể đổi thư mục bằng `KTC_BACKUP_DIR`.

### Lớp C – Excel backup
Desktop vẫn tạo bản sao Excel trước khi ghi đè. Excel không thay thế DB backup; nó chỉ là lớp phục hồi báo cáo/người dùng.

## 2. Lịch đề xuất
- Mỗi ngày 22:30: logical DB backup.
- Chủ nhật: kiểm tra checksum một bản gần nhất.
- Ngày 1 hàng tháng: copy bản tháng sang ổ/NAS/OneDrive doanh nghiệp chỉ dành cho backup.
- Mỗi quý: chạy thử restore vào DB staging, không restore thẳng production.

Windows Task Scheduler command:

```cmd
cmd /c "cd /d C:\VSCode\worker-management-system && npm run backup:db >> C:\KTC-logs\backup.log 2>&1"
```

## 3. Kiểm tra backup

```cmd
npm run backup:verify -- "C:\Users\<user>\Documents\KTC\Backup\Database\ktc-db-....jsonl.gz"
```

Checksum sai => không được restore. Với file `.enc`, restore còn xác thực AES-GCM; sai khóa hoặc file bị sửa sẽ thất bại.

## 4. Restore an toàn

Luôn restore thử vào staging trước:

```cmd
npm run restore:db -- --file "C:\...\ktc-db-....jsonl.gz" --confirm KTC_RESTORE --dry-run
```

DB đích phải rỗng. Nếu cố ý thay toàn bộ DB đích:

```cmd
npm run restore:db -- --file "C:\...\ktc-db-....jsonl.gz" --confirm KTC_RESTORE --replace
```

`--replace` là thao tác phá hủy dữ liệu hiện tại. Trước khi dùng trên production phải có backup mới và phê duyệt người quản trị.

## 5. Quy trình sự cố
1. Dừng ghi dữ liệu hoặc bật maintenance mode.
2. Xác định thời điểm sự cố và backup gần nhất.
3. Verify SHA-256.
4. Restore vào staging.
5. So sánh row counts + kiểm tra ngẫu nhiên báo cáo, user, master data, audit log.
6. Chỉ sau khi staging đạt mới phục hồi production.
7. Ghi incident log: ai restore, backup nào, thời gian, nguyên nhân.

## 6. Excel → DB
- Chỉ Admin/Manager được sync Excel vào DB.
- Workbook do KTC tạo có sheet metadata `_KTC_SYNC` rất ẩn.
- Chỉ các cột nghiệp vụ cho phép mới được đọc để sync.
- Cột công thức/tổng hợp là read-only về mặt logic, dù người dùng có thể sửa hiển thị trong Excel.
- Mỗi dòng dùng `ID` + `updated_at` để optimistic concurrency.
- Nếu DB đã thay đổi sau khi Excel được tạo: backend trả `409 REPORT_VERSION_CONFLICT`, không ghi đè.
- Kỳ đã khóa: trả `423 REPORTING_PERIOD_LOCKED`.
- Báo cáo máy: Excel chỉ cho sync `% học việc` và `Ghi chú`; dữ liệu dòng máy phải sửa trong ứng dụng để tránh làm hỏng aggregate.
- Mọi thay đổi từ Excel tạo report version + activity log `REPORT_UPDATED_FROM_EXCEL`.
