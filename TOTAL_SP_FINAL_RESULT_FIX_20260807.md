# TOTAL SP FINAL RESULT FIX — 2026-08-07

## Nghiệp vụ đã chốt
- `Tổng SP` / `Tổng SP quy đổi` **không cộng dồn** các kết quả trung gian.
- Chỉ lấy **kết quả SP quy đổi cuối cùng hợp lệ** theo đúng thứ tự báo cáo đã sắp xếp để xuất Excel.
- `Tổng OK`, `Tổng NG`, `Tổng thời gian`, `Thời gian thực tế`, `Tổng thời gian trừ` vẫn cộng bình thường.

## Phạm vi đã sửa
1. Dòng `TỔNG CỘNG` cuối mỗi sheet công đoạn trong workbook tháng.
2. Cột `Tổng SP` của sheet `TỔNG HỢP THÁNG`.
3. Thêm smoke test: dữ liệu GC có SP quy đổi `0 + 47 + 47` phải trả về `47`, không phải `94`.

## Cách chọn kết quả cuối
- Sắp xếp theo: ngày báo cáo -> thời gian báo cáo/duyệt -> mã NV -> máy -> ID.
- Duyệt từ cuối danh sách về đầu.
- Lấy giá trị `output` đầu tiên khác null/undefined và là số hợp lệ.
- Giá trị `0` vẫn là một kết quả hợp lệ.
