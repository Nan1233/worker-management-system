# KTC - Manager Excel Create/Update

- Dòng có ID: cập nhật report đã duyệt hiện có, chỉ field thực sự thay đổi.
- Dòng không có ID: manager/admin có thể tạo report chính thức mới từ Excel.
- Dòng mới phải nằm trong nhóm ngày của sheet (hàng ngày dd/mm/yyyy phía trên), có Mã NV, Ca, Mã SP.
- CẮT/LỒNG phải chọn Loại thao tác CẮT/LỒNG; Chế độ hỗ trợ TAY/MÁY.
- Dòng Máy trong Excel hỗ trợ 1 máy/dòng. Báo cáo nhiều máy phải tạo/chỉnh ở màn hình chi tiết để không mất dữ liệu machine lines.
- Backend validate worker assignment, master data, machine/product, time, OK/NG, deduction/defect details, duplicate, locked period.
- Create thành công ghi REPORT_CREATED_FROM_EXCEL và V1 report version.
