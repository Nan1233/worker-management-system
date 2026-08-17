# KTC Excel Master Data Reconciliation — 2026-08-17

Nguồn chuẩn: `file mẫu.xlsx`
SHA-256: `0aab63bffa213f335d06326231baa9a395455ab73d1aa19e0ef37182984704a4`

## Canonical master data

| Nhóm | Số lượng |
|---|---:|
| Công đoạn | 9 |
| Máy | 123 |
| Công nhân canonical | 648 |
| Alias mã công nhân | 9 |
| Phân công công nhân-công đoạn | 1409 |
| Dòng nguồn Nhân sự | 1448 |
| Dòng nguồn MSP | 1005 |
| Mapping sản phẩm canonical | 769 |
| Định mức sản phẩm | 2019 |
| Loại Trừ giờ | 135 |
| Loại NG | 135 |

### Máy theo công đoạn

- GC/Cắt lồng: 33
- Mài: 35
- Đo: 23 — gồm `QC`
- Cán: 3
- Ép: 29 — gồm 22 `Press` + 7 `INJ`

### Nhân sự

Dữ liệu `Nhân sự` được giữ nguyên từng dòng trong `master_personnel_source`, sau đó canonical hóa vào `workers` + `worker_processes`.

`P599` được giữ dưới dạng alias của công nhân canonical `599`, không tạo người trùng.

Có 2 mã nguồn chưa thể tự động đưa thành tài khoản canonical vì **cùng một mã được dùng cho nhiều người khác nhau**:

1. `DÊ` → `Thào A Dê` / `GIAÀNG A DÊ`
2. `THÁI` → `Lường Văn Thái` / `GIÀNG A THÁI`

Không tự ý phát minh mã mới cho 2 trường hợp này. Chúng được giữ nguyên trong `master_personnel_source` với trạng thái `unresolved` để quản trị viên xác nhận.

## Cách áp dụng DB

1. Chạy migration:
   `npm run db:migrate`
2. Seed master:
   `npm run db:seed-master`
3. Audit exact DB ↔ snapshot:
   `npm run db:audit-master`

`db:audit-master` sẽ fail nếu thiếu/thừa máy, công nhân canonical hoặc phân công so với snapshot.

## Lưu ý

Không xóa `production_reports`, `production_reports_temp` hoặc dữ liệu lịch sử. Seed dùng upsert và các bảng source/reconciliation để bảo toàn nguồn Excel.
