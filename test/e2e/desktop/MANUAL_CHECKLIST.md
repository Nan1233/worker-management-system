# Desktop – manual checklist (Windows)

Phần tự động (`npm run test:e2e:desktop`) chỉ chạy được những gì Node làm được:
`node --check`, contract IPC, `companyExcelLocal`, smoke Excel, các test có sẵn trong
`desktop/tests`. Mọi thứ cần EXE thật, cửa sổ, hộp thoại native hay Excel thật nằm ở đây.

Ghi kết quả từng bước: **PASS / FAIL / SKIP (lý do)**. Không đánh PASS cho bước chưa làm.

## 0. Chuẩn bị

| # | Bước | Kỳ vọng |
|---|------|---------|
| 0.1 | Máy Windows 10/11 x64, có Microsoft Excel. | — |
| 0.2 | Backend trỏ tới **E2E/staging** (`DB_NAME=worker_management_e2e`). **Không dùng production.** | Ghi lại URL backend đã dùng. |
| 0.3 | Build: `cd desktop && npm ci && npm run dist:portable` (hoặc lấy EXE từ release đang kiểm). | Có file `release/*.exe`; ghi lại version + SHA256. |
| 0.4 | Có tài khoản quản lý E2E và ít nhất 1 báo cáo GC **2 máy** đã duyệt trong tháng kiểm tra (tạo bằng `npm run test:e2e:db` với `KTC_E2E_KEEP_DATA=1`, hoặc nhập tay). | — |

## 1. Khởi động EXE

| # | Bước | Kỳ vọng |
|---|------|---------|
| 1.1 | Mở EXE (double-click). | Cửa sổ chính hiện trong ≤ 10 s, không màn hình trắng, không hộp lỗi. |
| 1.2 | Ngắt mạng rồi mở lại EXE. | Hiện trang offline (`assets/offline.html`), không crash. Bật mạng lại → app tự vào trang đăng nhập. |
| 1.3 | Đăng nhập quản lý. | Vào dashboard quản lý. |
| 1.4 | Mở thư mục log (menu/hành động "Mở thư mục log"). | Explorer mở thư mục log; file log **không chứa** token, mật khẩu, cookie. |

## 2. Đường dẫn xuất Excel

| # | Bước | Kỳ vọng |
|---|------|---------|
| 2.1 | Xem thư mục xuất mặc định. | `\\KTCNAS\Public\3. SẢN XUẤT-製造\Linh tinh` (hoặc thư mục đã cấu hình). Đây là bước test tự động SKIP trên Linux. |
| 2.2 | "Chọn thư mục xuất" → hộp thoại chọn thư mục native. | Hộp thoại mở; chọn thư mục local → đường dẫn mới được lưu. |
| 2.3 | Huỷ hộp thoại. | Đường dẫn cũ giữ nguyên, không lỗi. |
| 2.4 | "Đặt lại thư mục mặc định". | Quay về đường dẫn NAS mặc định. |
| 2.5 | NAS không truy cập được. | Thông báo lỗi rõ ràng, không treo app. |

## 3. Xuất Excel công ty (Gia công – 04_CAT_LONG)

| # | Bước | Kỳ vọng |
|---|------|---------|
| 3.1 | Xuất Excel tháng có báo cáo GC 2 máy. | File `A+B GIA CÔNG THÁNG MM-YYYY.xlsx` được tạo trong thư mục xuất. |
| 3.2 | Mở file bằng Excel. | Mở không có cảnh báo "repair", không `#REF!` / `#N/A`. |
| 3.3 | Báo cáo 2 máy. | **2 dòng**, mỗi dòng đúng máy, giờ, trừ giờ, OK/NG, lỗi của chính máy đó (đối chiếu DB). ⚠️ Test tự động hiện FAIL ở bước này (xem báo cáo bug). |
| 3.4 | Báo cáo ngày ≠ ngày 1 trong tháng. | Có trong file. ⚠️ Test tự động hiện FAIL (báo cáo bị bỏ qua). |
| 3.5 | Cột %TT (AA ở 04_CAT_LONG). | Là công thức `=IFERROR(Z/Y,0)`, không phải số cứng. |
| 3.6 | Định dạng màu %TT. | <80% đỏ, 80–90% vàng, 90–100% xanh, >100% hồng. |
| 3.7 | Dòng ngày. | Mỗi ngày có 1 dòng ngày tô màu, STT bắt đầu lại từ 1 sau mỗi dòng ngày. |
| 3.8 | Lỗi không map được (10 lỗi GC như "Cắt phạm", "Khác"). | Không bị gộp vào cột khác (kể cả cột "Khác" nếu có); số lượng vẫn nằm trong Tổng NG. |

## 4. Xem trực quan, in, freeze

| # | Bước | Kỳ vọng |
|---|------|---------|
| 4.1 | Cuộn xuống/qua phải. | Header (3 dòng đầu) đứng yên (freeze pane). |
| 4.2 | Bộ lọc (AutoFilter). | Có ở dòng header, lọc được theo Mã NV / Máy / SP. |
| 4.3 | Độ rộng cột, chiều cao header, wrap text. | Giống file mẫu 04_CAT_LONG; chữ header không bị cắt. |
| 4.4 | Print Preview (Ctrl+P). | Vùng in A1:AV<dòng cuối>, khổ và hướng giấy như mẫu, không trang trắng thừa. |
| 4.5 | Lưu lại bằng Excel rồi mở lại. | Không mất công thức, không mất định dạng. |

## 5. Đồng bộ Excel ↔ DB / Import báo cáo

| # | Bước | Kỳ vọng |
|---|------|---------|
| 5.1 | "Xem trước đồng bộ" tháng có dữ liệu. | Bảng xem trước hiện số dòng thay đổi; không ghi gì vào DB. |
| 5.2 | Áp dụng đồng bộ. | Chỉ áp dụng dòng đã xem trước; kết quả báo số dòng thành công/thất bại. |
| 5.3 | Import báo cáo: chọn file `.xlsx` (hộp thoại mở file native). | Chỉ nhận file đã xem trước; file khác / quá hạn bị từ chối (`KTC_IMPORT_FILE_MISMATCH`, `KTC_IMPORT_PREVIEW_EXPIRED`). |
| 5.4 | Chọn file > giới hạn dung lượng. | Bị từ chối trước khi đọc (`KTC_IMPORT_FILE_TOO_LARGE`). |
| 5.5 | Lưu Excel thống kê (hộp thoại Save native). | File lưu đúng tên/thư mục đã chọn; huỷ hộp thoại không tạo file. |

## 6. Bảo mật / cập nhật

| # | Bước | Kỳ vọng |
|---|------|---------|
| 6.1 | Click link ngoài trong app. | Mở bằng trình duyệt hệ thống, chỉ `http/https`. |
| 6.2 | DevTools trong bản release. | Không mở được (hoặc theo chính sách release). |
| 6.3 | Auto-update (nếu bật). | Kiểm tra cập nhật không chặn UI; lỗi mạng được log, không crash. |
| 6.4 | Đăng xuất rồi đóng app, mở lại. | Phải đăng nhập lại; token cũ không còn hiệu lực. |

## Ghi kết quả

```
Ngày kiểm:            ____
Người kiểm:           ____
EXE version / SHA256: ____
Backend URL:          ____ (E2E/staging)
Kết quả: PASS __ / FAIL __ / SKIP __ (lý do cho từng SKIP)
```
