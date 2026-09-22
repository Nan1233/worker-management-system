# KTC – Manual Test Cases (Code-based)

> Branch: `test`
> Scope: kiểm thử thủ công qua FE thật, thao tác như người dùng thật; FE gọi API test/staging tương ứng.
> Không gọi API trực tiếp để thay thế thao tác FE trong các testcase E2E.
>
> Căn cứ code hiện tại: `ProcessPage.tsx`, `ProductionDetail.tsx`, `productionService.ts`, cùng bộ testcase hiện có `test-cases-full.csv`.

## Quy ước

- **PASS**: kết quả thực tế đúng Expected Result.
- **FAIL**: khác Expected Result; ghi rõ Actual Result + screenshot/video.
- **BLOCKED**: không thể thực hiện vì môi trường/dữ liệu, không tính là lỗi nghiệp vụ nếu chưa xác minh.
- Dữ liệu test phải lấy từ DB/migration của môi trường test; không tự tạo mã máy/sản phẩm/công đoạn nếu chúng không tồn tại trong master data.

---

## A. Login / Session

| ID | Mục tiêu | Thao tác manual | Expected |
|---|---|---|---|
| AUTH-001 | Worker login hợp lệ | Mở FE → nhập mã worker hợp lệ → tiếp tục/đăng nhập | Worker vào đúng màn hình worker, không hiện lỗi đăng nhập |
| AUTH-002 | Worker login mã không tồn tại | Nhập mã không có trong DB → đăng nhập | Hiện thông báo mã nhân viên/thông tin đăng nhập không hợp lệ; không tạo session worker |
| AUTH-003 | Refresh sau login | Đăng nhập worker → F5 | Session vẫn hợp lệ theo cơ chế auth hiện tại; không tự chuyển sang màn hình manager |
| AUTH-004 | Logout | Worker đăng nhập → logout | Session bị xóa; truy cập lại route worker yêu cầu đăng nhập |
| AUTH-005 | Manager login | Nhập manager hợp lệ + mật khẩu → đăng nhập | Vào khu vực manager |
| AUTH-006 | Worker truy cập manager | Đăng nhập worker → mở route manager | Bị chặn theo authorization; không hiển thị dữ liệu manager |

---

## B. Worker – mở công đoạn / master data

| ID | Mục tiêu | Thao tác manual | Expected |
|---|---|---|---|
| PROC-001 | Hiển thị danh sách công đoạn | Worker mở màn hình nhập báo cáo | Các công đoạn mà worker được phép truy cập hiển thị; không hiển thị công đoạn ngoài quyền |
| PROC-002 | Mở công đoạn Cắt/Lồng | Chọn công đoạn Cắt/Lồng | Form sản xuất được render, có các trường tương ứng |
| PROC-003 | Công đoạn Mài | Mở Mài | Form Mài render đúng và không dùng nhầm rule của công đoạn khác |
| PROC-004 | Công đoạn Đo | Mở Đo | Form Đo render đúng |
| PROC-005 | Công đoạn Kiểm | Mở Kiểm | Form Kiểm render đúng |
| PROC-006 | Công đoạn Cán | Mở Cán | Form Cán render đúng |
| PROC-007 | Công đoạn Ép | Mở Ép | Form Ép render đúng |
| PROC-008 | Công việc khác/CVK | Mở công đoạn CVK | Form công việc khác render; trường sản xuất đặc thù không xuất hiện sai |
| PROC-009 | Chọn ca | Chọn lần lượt ca A/B/C/D nếu có trong dữ liệu | Ca được chọn và được giữ trong form |
| PROC-010 | Dữ liệu master tải lỗi | Mở form khi API master data lỗi/không có dữ liệu | Không cho submit dữ liệu không xác định; hiển thị trạng thái/lỗi phù hợp |

---

## C. Machine → Product → Standard

Code hiện tại tải machine/product từ master data và lọc product theo process, operation mode, machine; với GC còn có rule encoded machine suffix.

| ID | Mục tiêu | Thao tác manual | Expected |
|---|---|---|---|
| MASTER-001 | Chọn máy trước sản phẩm | Vào công đoạn yêu cầu máy → chọn máy | Product list được lọc theo máy đã chọn |
| MASTER-002 | Product theo công đoạn | Chọn công đoạn → mở product list | Chỉ product hợp lệ với process xuất hiện |
| MASTER-003 | Product không thuộc máy | Chọn máy A → tìm product chỉ thuộc máy B | Product không hợp lệ không xuất hiện/không được submit |
| MASTER-004 | Định mức | Chọn máy + product hợp lệ | Form lấy định mức từ master data và hiển thị/cập nhật standard output |
| MASTER-005 | Đổi máy | Chọn máy A + product → đổi sang máy B | Product/định mức phụ thuộc máy được reset hoặc cập nhật; không giữ dữ liệu sai |
| MASTER-006 | Đổi operation mode | Chọn dữ liệu → chuyển mode | Các field phụ thuộc mode được reset theo code; không gửi dữ liệu ẩn của mode cũ |
| MASTER-007 | GC machine mapping | Chọn máy GC có dữ liệu migration | Product tương ứng máy hiển thị đúng, không chỉ còn một mã product chung cho mọi máy |

---

## D. Cắt/Lồng – defect

Code dùng `activeNgOptions`, `operationType`, `operationMode`, machine lines và aggregate defect quantity.

| ID | Mục tiêu | Thao tác manual | Expected |
|---|---|---|---|
| DEF-001 | Cắt hiển thị CAT | Chọn mode Cắt | Chỉ defect CAT hợp lệ của Cắt được hiển thị |
| DEF-002 | Lồng hiển thị LONG | Chọn mode Lồng | Chỉ defect LONG hợp lệ của Lồng được hiển thị |
| DEF-003 | Chuyển Cắt → Lồng | Chọn một defect Cắt → chuyển Lồng | Defect Cắt không được mang sang dữ liệu Lồng |
| DEF-004 | Chuyển Lồng → Cắt | Chọn defect Lồng → chuyển Cắt | Defect Lồng không được mang sang dữ liệu Cắt |
| DEF-005 | Nhập NG hợp lệ | Nhập quantity defect > 0 | NG tổng cập nhật theo defect |
| DEF-006 | Quantity âm | Nhập quantity âm | Không cho nhập/submit giá trị âm |
| DEF-007 | Quantity không hợp lệ | Nhập chữ/ký tự không phải số | Không cho tạo báo cáo với quantity không hợp lệ |
| DEF-008 | Tổng NG nhiều defect | Nhập nhiều defect | NG tổng bằng tổng defect hợp lệ theo rule hiện tại |
| DEF-009 | KQD policy | Chọn product có policy `exclude_kqd_from_tt` khác nhau | Tổng output/NG xử lý theo policy snapshot của product, không tự áp dụng một rule chung |

---

## E. Machine lines / shared machine

| ID | Mục tiêu | Thao tác manual | Expected |
|---|---|---|---|
| MACH-001 | Một máy | Mở process single-machine → nhập máy | Chỉ một machine line được sử dụng |
| MACH-002 | Nhiều máy | Mở process hỗ trợ multi-machine → thêm machine lines | Số line không vượt max theo code/master data |
| MACH-003 | Mỗi line có product | Chọn máy/product cho từng line | Mỗi line giữ đúng máy, product và standard riêng |
| MACH-004 | Aggregate output | Nhập OK/NG ở nhiều line | Form tổng hợp OK/NG/output theo aggregate machine lines |
| MACH-005 | Shared machine accounting | Dùng dữ liệu machine có nhiều worker | Physical machine truth và worker credit không bị trộn thành một giá trị |
| MACH-006 | GC max workers | Dùng machine GC có rule giới hạn | Không cho vượt số worker/machine theo master/rule hiện tại |

---

## F. Thời gian / trừ giờ

Code có `MAX_TOTAL_WORK_MINUTES`, `getProspectiveTotalWorkMinutes`, deduction normalization và daily-hours API.

| ID | Mục tiêu | Thao tác manual | Expected |
|---|---|---|---|
| TIME-001 | Nhập giờ/phút hợp lệ | Nhập thời gian hợp lệ | Form chuẩn hóa đúng giờ + phút |
| TIME-002 | Tổng thời gian tối đa | Nhập báo cáo làm tổng thời gian > 12 giờ/ngày | Submit bị chặn; hiển thị lý do vượt giới hạn |
| TIME-003 | Hai báo cáo cộng dồn >12h | Tạo/đã có report trong ngày → nhập report thứ hai khiến tổng >12h | Report thứ hai bị chặn theo daily working hours |
| TIME-004 | Đúng 12h | Tổng production time = 12h | Không bị chặn chỉ vì bằng giới hạn |
| TIME-005 | Trừ giờ | Chọn deduction/support hợp lệ | Thời gian trừ được lưu đúng; không làm tăng production counted hours |
| TIME-006 | Deduction không hợp lệ | Nhập giờ trừ âm/không hợp lệ | Không cho submit |
| TIME-007 | CVK time | Nhập công việc khác có giờ/phút | Chi tiết thời gian hiển thị đúng ở report detail |

---

## G. Ngày làm việc / ca

| ID | Mục tiêu | Thao tác manual | Expected |
|---|---|---|---|
| DATE-001 | Ngày hiện tại | Mở form | Ngày mặc định đúng local date |
| DATE-002 | Backdate hợp lệ | Chọn ngày trong khoảng worker được phép | Có thể nhập report |
| DATE-003 | Backdate quá giới hạn | Chọn ngày ngoài khoảng cho phép | Không cho submit |
| DATE-004 | Đổi ca | Chọn ca khác | Work date/field liên quan được xử lý theo rule shift hiện tại; không tạo ngày sai |

---

## H. Tạo báo cáo / duplicate

`productionService.ts` hiện dùng `POST /production-temp` và `POST /production-temp/check-similar`; form có client request id và duplicate flow.

| ID | Mục tiêu | Thao tác manual | Expected |
|---|---|---|---|
| REPORT-001 | Submit report hợp lệ | Điền đầy đủ field bắt buộc → Lưu | FE gửi report qua `/production-temp`; report được tạo thành công |
| REPORT-002 | Thiếu máy | Bỏ máy ở process bắt buộc máy → Lưu | Submit bị chặn |
| REPORT-003 | Thiếu product | Bỏ product → Lưu | Submit bị chặn |
| REPORT-004 | Thiếu ca | Bỏ ca → Lưu | Submit bị chặn |
| REPORT-005 | Sản lượng âm | Nhập quantity âm → Lưu | Submit bị chặn |
| REPORT-006 | Product ngoài master | Tự nhập mã không tồn tại → Lưu | Không tạo report |
| REPORT-007 | Machine ngoài master | Tự nhập máy không tồn tại → Lưu | Không tạo report |
| REPORT-008 | Duplicate report | Nhập lại cùng process/date/shift/machine/product | FE hiển thị duplicate flow; không âm thầm tạo bản ghi trùng |
| REPORT-009 | Double click Save | Click lưu liên tục nhiều lần | Không tạo duplicate do submit lock/client request guard |
| REPORT-010 | Mất mạng khi submit | Submit trong lúc API mất kết nối | FE xử lý transient failure theo cơ chế offline queue; không báo thành công giả |

---

## I. History / Detail / Edit

`ProductionDetail.tsx` xác định report pending/need_fix là trạng thái worker có thể sửa; cửa sổ sửa là **10 phút từ `created_at`**.

| ID | Mục tiêu | Thao tác manual | Expected |
|---|---|---|---|
| HIST-001 | Xem lịch sử | Worker mở lịch sử | Danh sách report của worker tải được |
| HIST-002 | Mở chi tiết pending | Chọn report pending | Chi tiết report hiển thị |
| HIST-003 | Chi tiết hiển thị worker | Mở report | Tên worker, mã worker, process, created/updated time hiển thị |
| HIST-004 | Chi tiết sản xuất | Mở report sản xuất | Machine, product, standard, target, actual, OK, NG hiển thị |
| HIST-005 | Chi tiết defect | Report có defect >0 → mở detail | Các defect có quantity >0 hiển thị |
| HIST-006 | Chi tiết deduction | Report có deduction >0 → mở detail | Chi tiết trừ giờ hiển thị |
| HIST-007 | Sửa trong 10 phút | Tạo report → trong <10 phút mở detail → Sửa | Form edit mở và dữ liệu cũ tự điền vào đúng field |
| HIST-008 | Lưu edit trong 10 phút | Sửa một giá trị → Lưu | Report được cập nhật; mở lại detail thấy giá trị mới |
| HIST-009 | Hết 10 phút | Dùng report đã quá 10 phút → mở detail | Hiển thị `Đã hết thời gian chỉnh sửa`; không cho worker sửa |
| HIST-010 | Report approved | Mở report approved | Hiển thị `Đã duyệt`; không cho worker sửa theo flow pending |
| HIST-011 | Report need_fix | Manager trả report cần sửa → worker mở | Hiển thị trạng thái cần sửa và cho sửa nếu còn trong window theo rule hiện tại |

---

## J. Manager – review / approve / reject

| ID | Mục tiêu | Thao tác manual | Expected |
|---|---|---|---|
| MGR-001 | Pending queue | Manager mở danh sách chờ duyệt | Report worker vừa tạo xuất hiện nếu thỏa filter |
| MGR-002 | Filter date | Lọc theo ngày | Chỉ report trong khoảng ngày được chọn hiển thị |
| MGR-003 | Filter shift | Lọc theo ca | Chỉ report đúng ca hiển thị |
| MGR-004 | Filter process | Lọc theo công đoạn | Chỉ report đúng process hiển thị |
| MGR-005 | Search | Tìm theo thông tin hỗ trợ search | Kết quả được lọc đúng |
| MGR-006 | Mở pending detail | Manager mở report | Detail tải từ `/production-temp/:id` |
| MGR-007 | Approve | Chọn report pending → duyệt | Report chuyển trạng thái approved; thời điểm/người duyệt được ghi nhận |
| MGR-008 | Reject | Chọn report → từ chối + reason | Report chuyển trạng thái theo reject flow và reason được lưu |
| MGR-009 | Approve concurrency | Mở cùng report ở hai cửa sổ manager → một bên cập nhật trước | Bên còn lại không được ghi đè sai dữ liệu nếu backend concurrency rule từ chối |
| MGR-010 | Approved list | Sau approve → mở danh sách approved | Report xuất hiện trong approved list |

---

## K. Export Excel

`productionService.ts` có export pending/approved và export selected approved; desktop runtime dùng `syncAllExcel`, web dùng `POST /reports/export-excel`.

| ID | Mục tiêu | Thao tác manual | Expected |
|---|---|---|---|
| XLS-001 | Export pending | Manager chọn ngày → export pending | File Excel được tạo/tải thành công |
| XLS-002 | Export approved | Manager chọn ngày → export approved | File Excel approved được tạo/tải thành công |
| XLS-003 | Export approved data | Có report approved → export | Excel chứa đúng report approved |
| XLS-004 | Export date invalid | Thử ngày không đúng `YYYY-MM-DD` qua UI nếu có thể | FE/backend từ chối ngày không hợp lệ |
| XLS-005 | Desktop sync | Chạy Manager Desktop → export/update Excel | Desktop sync hoàn thành và trả success |
| XLS-006 | Excel monthly status | Kiểm tra trạng thái file tháng sau approve | Trạng thái file/count/latest update phản ánh dữ liệu hiện tại |

---

## L. Mobile / responsive

| ID | Mục tiêu | Thao tác manual | Expected |
|---|---|---|---|
| MOB-001 | Worker 390x844 | DevTools responsive 390x844 → mở process | Không có horizontal overflow; field/button thao tác được |
| MOB-002 | Worker history 390x844 | Mở history/detail | Không che mất dữ liệu; nút sửa/quay lại dùng được |
| MOB-003 | Form defect mobile | Mở defect section ở 390x844 | Không bị tràn/ẩn input quantity |
| MOB-004 | Machine/product mobile | Chọn máy rồi product | Dropdown/autocomplete không bị cắt khỏi viewport theo cách làm mất lựa chọn |
| MOB-005 | Manager 1440x900 | Mở manager dashboard/list | Bảng/KPI/chart không bị vỡ layout |

---

## M. Regression quan trọng

| ID | Mục tiêu | Thao tác manual | Expected |
|---|---|---|---|
| REG-001 | Operation switch reset hidden defects | Nhập defect Cắt → chuyển Lồng → submit | Payload không chứa defect Cắt ẩn |
| REG-002 | Lồng → Cắt | Nhập LONG → chuyển Cắt | Payload không chứa LONG ẩn |
| REG-003 | Machine change reset product | Chọn machine/product → đổi machine | Không submit product không thuộc machine mới |
| REG-004 | Process change reset form | Điền form → chuyển process | Dữ liệu đặc thù process cũ không bị gửi sang process mới |
| REG-005 | Edit preserves values | Tạo report → mở edit | Machine/product/shift/time/defects/deductions/extra fields khôi phục đúng |
| REG-006 | Detail NG consistency | Report có nhiều defect | NG tổng trên detail khớp tổng defect hiển thị theo rule |
| REG-007 | KQD canonicalization | Dùng product có KQD policy | KQD được tính/loại khỏi total theo policy của product tại thời điểm report |
| REG-008 | Training snapshot | Worker có training % → tạo report → thay đổi master training % → mở report | Report cũ vẫn hiển thị snapshot đã ghi nhận, không tự đổi theo master mới |
| REG-009 | Shared-machine accounting | Nhiều worker cùng physical machine | Machine physical output và worker credited output không bị nhập nhằng |
| REG-010 | Refresh after save | Save report → F5 → mở history/detail | Report không biến mất và dữ liệu vẫn nhất quán |

---

## N. Bộ smoke test cần chạy trước mỗi lần deploy test

1. `AUTH-001` Worker login hợp lệ.
2. `PROC-002` Mở Cắt/Lồng.
3. `MASTER-001` Chọn máy trước product.
4. `MASTER-004` Lấy định mức.
5. `DEF-001` Cắt defect.
6. `DEF-002` Lồng defect.
7. `REPORT-001` Tạo report hợp lệ.
8. `HIST-007` Mở edit và kiểm tra auto-fill.
9. `TIME-003` Kiểm tra giới hạn 12h.
10. `MGR-001` Manager thấy pending report.
11. `MGR-007` Approve report.
12. `XLS-002` Export approved Excel.
13. `MOB-001` Worker mobile 390x844.
14. `REG-001` Operation switch không mang defect ẩn.

## O. Mẫu ghi kết quả

| ID | Date | Tester | Environment | Actual Result | Status | Evidence | Bug/Issue |
|---|---|---|---|---|---|---|---|
| AUTH-001 | | | test | | PASS/FAIL/BLOCKED | screenshot/video | |

### Nguyên tắc

- Test qua UI như người dùng thật trước.
- Khi FAIL, ghi **test data + URL/route + bước cuối cùng + Actual Result + screenshot**.
- Không sửa code web chỉ để làm testcase PASS.
- Không đánh dấu PASS chỉ vì API trả 2xx; phải kiểm tra UI và dữ liệu hiển thị sau thao tác.
