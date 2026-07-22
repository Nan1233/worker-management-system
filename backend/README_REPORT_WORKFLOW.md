# Nâng cấp quy trình duyệt báo cáo

## 1. Chạy migration

Chạy file:

`migration_report_workflow.sql`

trên database hiện tại trước khi deploy backend.

## 2. API mới

### Danh sách chờ duyệt

`GET /api/production-temp/pending`

Query tùy chọn:

- `date=YYYY-MM-DD`
- `shift=Ca 1`
- `process_id=1`
- `search=599`

Mỗi dòng có thêm:

- `is_duplicate`
- `duplicate_count`

Trùng khi cùng ngày, ca, máy và sản phẩm.

### Duyệt một hoặc nhiều báo cáo

`POST /api/production-temp/approve`

```json
{
  "ids": [1, 2, 3]
}
```

### Từ chối một hoặc nhiều báo cáo

`POST /api/production-temp/reject`

```json
{
  "ids": [1, 2],
  "reason": "Sai mã máy"
}
```

### Manager/Admin sửa báo cáo

`PUT /api/production-temp/:id`

```json
{
  "machine_no": "CL-02",
  "actual_output": 7000,
  "tt_ok": 6950,
  "tt_ng": 50,
  "reason": "Công nhân nhập sai mã máy"
}
```

### Xem log thao tác

`GET /api/production-temp/:id/logs`

## 3. Phân quyền

- Worker: tạo và xem báo cáo của mình.
- Lead: xem, duyệt, từ chối trong công đoạn được phân công.
- Manager: xem, sửa, duyệt, từ chối trong công đoạn được phân công.
- Admin: toàn quyền.

## 4. Lưu ý

Báo cáo tạm sau khi duyệt được giữ lại với trạng thái `approved` để bảo toàn log. Lịch sử công nhân không hiển thị trùng vì bản tạm đã duyệt được loại khỏi truy vấn lịch sử.
