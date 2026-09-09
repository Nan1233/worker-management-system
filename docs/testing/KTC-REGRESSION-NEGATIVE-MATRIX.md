# KTC Regression + Negative Test Matrix

## Mục tiêu

Regression không chỉ kiểm tra happy path. Mỗi nhóm phải có:

- 🟢 Happy path: dữ liệu hợp lệ phải chạy.
- 🔴 Negative: cố tình đưa dữ liệu chắc chắn sai; hệ thống phải chặn.
- 🟠 Boundary: kiểm tra sát giới hạn.
- 🔐 Permission/API bypass: UI có thể chặn chưa đủ; API cũng phải từ chối dữ liệu/quyền sai.

## Bộ test ưu tiên

| ID | Nhóm | 🟢 Happy path | 🔴 Negative phải bắt | 🟠 Boundary |
|---|---|---|---|---|
| R02 | Chọn máy/sản phẩm | Chọn process + máy + sản phẩm hợp lệ | Máy không tồn tại; sản phẩm không thuộc máy/process | Đổi máy sau khi chọn sản phẩm; phải resolve lại standard |
| R05 | Cắt/Lồng | Lồng + máy số + sản phẩm Lồng | Áp suffix Cắt cho Lồng; sản phẩm sai work type | Đổi giữa máy Cắt/Lồng và kiểm tra lại danh sách |
| R06 | 2801-LT | Máy GC Lồng 1/10 + 2801-LT + 605/h | Máy/process không hợp lệ; sản phẩm bị lọc như Cắt | Tất cả máy GC Lồng active numeric phải giữ 2801-LT |
| R09 | Máy tự động/shared | GC 5/6/7/11 theo rule | Worker thứ 5 vào cùng máy | Đúng 4 người / vượt 4 người |
| R15 | Sản lượng/OK-NG | OK + NG hợp lệ | Số âm; tổng không hợp lệ; input không phải số | 0, giá trị sát giới hạn |
| R16 | Thời gian | Tổng thời gian hợp lệ | >12h; thời gian âm | Đúng 12h / 12h01 |
| R20 | Công việc khác | Xuất nhập không product | Ép CVK có product/standard/sản lượng | Xuất và Nhập phải cùng logical work type |
| R22 | Sửa báo cáo | Worker sửa pending trong 10 phút | Sửa >10 phút; sửa approved; sửa report người khác | Sát mốc 10 phút |
| R23 | Manager/Excel | Manager đúng process duyệt → Excel | Manager sai process; dữ liệu thiếu/sai | Conflict/version thay đổi trước approve |

## API bypass cases

1. Bỏ `client_request_id` → reject.
2. Gửi duplicate không có confirmation token → reject/challenge.
3. Dùng confirmation token không hợp lệ → reject.
4. Manager không thuộc process → reject approval.
5. Worker cố sửa report không thuộc mình → reject.
6. Worker cố sửa report ngoài cửa sổ 10 phút → reject.
7. Gửi ngày tương lai → reject.
8. Gửi ngày quá 14 ngày về trước → reject.
9. Gửi tổng thời gian >12h → reject.
10. Gửi dữ liệu Lồng nhưng cố áp rule suffix Cắt → reject hoặc không cho chọn từ master data.

## Tiêu chí PASS

Một case chỉ PASS khi tất cả tầng phù hợp đều đúng:

- UI hiển thị/ẩn đúng.
- API reject/accept đúng HTTP status và error code.
- DB không lưu dữ liệu invalid.
- Manager không thể duyệt dữ liệu không hợp lệ.
- Excel chỉ xuất canonical data đã được xác nhận.

## Quy trình chạy

1. Chạy contract regression test.
2. Chạy negative/boundary cases trên môi trường Cloudflare với fixture an toàn.
3. Nếu FAIL: sửa code, thêm regression contract cho lỗi đó.
4. Chạy lại toàn bộ regression.
5. Chỉ sau khi regression ổn mới chuyển sang xử lý STT 19 và STT 24.

## Automation hiện có

- `tests/regression-report-issues.contract.test.cjs`
- `tests/2801-lt-long-selection.contract.test.cjs`
- `tests/cloudflare-production-contract.test.cjs`
- `scripts/zero-cost/critical-e2e.cjs`
- `scripts/cloudflareProductionSmoke.cjs`
