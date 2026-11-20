# KTC — Clean code & điều kiện nghiệm thu trước khi phát hành

**Ngày:** 20/11/2026 · **Nhánh kiểm thử:** `refactor/ktc-local-cleanup`

## 1. Phạm vi mã nguồn và kết quả đã xác nhận

Đây là nhánh thử nghiệm. Không merge, không deploy FE/BE/Desktop, không chỉnh sửa TiDB production trong quá trình refactor.

Các thay đổi đã thực hiện:
- Tách và kiểm thử chuẩn hóa bộ lọc/cache danh sách chờ duyệt và đã duyệt; giữ nguyên API response và phạm vi manager.
- Bảo vệ form sửa báo cáo: chặn nhập/lưu trước khi nạp đầy đủ dữ liệu gốc và danh mục, kiểm tra TT OK sau khi PUT.
- Ổn định các mục điều hướng Admin mobile; menu chính không thay đổi vị trí theo tiến trình tải quyền.
- Cập nhật E2E Chromium desktop/mobile, kiểm thử luồng duyệt đúng ID, chống ghi đè định mức lịch sử, phân quyền, đăng nhập và xuất Excel qua Desktop.
- Bật `failOnFlakyTests` trên CI: dù retry thành công, suite sẽ FAIL nếu từng có bài test lỗi.
- Tách metadata cấu hình MasterData (cột, roles, tên nhãn và normalizers) với unit test.
- Tăng chặt kiểm tra bộ cài Windows: bắt buộc đủ hai tệp EXE Setup/Portable với dung lượng lớn hơn 0; không tự suy diễn việc có EXE là đã cài đặt thành công.

**CI bảo đảm:** Backend/TiDB cô lập; browser authenticated; Windows NSIS/Portable staging; frontend lint/typecheck/build; synthetic Excel parity. CI không kiểm thử máy KTC thực, không cung cấp bằng chứng chữ ký phát hành, không dùng dữ liệu production.

## 2. Ma trận nghiệm thu còn phải thực hiện trên môi trường có phép

| Cổng | Tiêu chí đạt | Bằng chứng cần lưu | Trạng thái |
|---|---|---|---|
| Windows Setup | Cài trên PC Windows đích, khởi động, login môi trường TEST, không lỗi crash | Phiên bản, ảnh màn hình, log | **Chưa chạy thực địa** |
| Windows Portable | Chạy được không cài đặt, restart và nâng cấp, không mất profile | Log và ảnh | **Chưa chạy thực địa** |
| Windows uninstall/reinstall | Dữ liệu Desktop người dùng không mất ngoài dự kiến, shortcut đúng | Checklist hai lần cài | **Chưa chạy thực địa** |
| Code signing | EXE chính thức có Authenticode SHA-256 và chain đáng tin, kiểm tra SmartScreen trên PC thật | Kết quả xác minh chữ ký | **Chưa được xác minh** |
| Excel export | Mỗi công đoạn xuất đúng file và sheet, đúng ngày/ca, ID, STT, NG, trừ giờ | Workbook đã ẩn danh + kiểm tra `_KTC_SYNC` | **Chỉ CI synthetic đã đạt** |
| Excel ↔ DB | Đối soát report ID, OK/NG, giờ, định mức snapshot; dữ liệu chỉnh sửa được phép được đồng bộ đúng và không lặp | Bảng đối soát trước/sau | **Chưa chạy dữ liệu thật** |
| Shared machines | Một máy có 1–2 công nhân, sản lượng vật lý không nhân đôi, định mức/giờ khớp | Dữ liệu testcase GC và workbook | **Chỉ CI synthetic đã đạt** |
| Concurrency | Hai người sửa cùng báo cáo: client cũ nhận conflict, không ghi đè | Hai session + audit/version | **CI đạt; cần UAT** |
| Offline/drafts | Mất mạng khi nhập/lưu, phục hồi draft, không trùng khi gửi lại | Log, screenshot, report ID | **Chưa UAT thực địa** |
| RBAC | Worker/Lead/Manager/Admin không đọc/sửa ngoài quyền công đoạn | Tài khoản TEST các role | **CI đạt; cần UAT** |
| DB backup/restore | Artifact hợp lệ; phục hồi được vào DB staging tách biệt; dữ liệu hàng/phiên bản khớp | SHA256, log, kiểm tra thống kê | **Chưa chạy với bản sao được cấp phép** |
| Rollback | Chạy lại phiên bản trước trên staging và phục hồi cấu hình/file không mất dữ liệu | Runbook + log | **Chưa chạy thực địa** |

Các mục **Chưa chạy** không được cập nhật thành PASS nếu không có bằng chứng.

## 3. Trình tự thử trên Windows thực tế (chỉ môi trường TEST)

1. Tạo một PC hoặc VM Windows thử nghiệm được phép sử dụng. Sao lưu thư mục dữ liệu KTC, thư mục workbook tháng trước khi kiểm tra nâng cấp; không dùng dữ liệu thật nếu chưa được phê duyệt.
2. Build staging trên máy build riêng (lệnh trong `desktop/package.json`: `npm run dist:win:test`) hoặc dùng đúng hai artifact staging từ pipeline được phép. Hai tên dự kiến: `KTC-Production-Control-Setup.exe` và `KTC-Production-Control.exe`. Không coi các file unsigned là bản phát hành chính thức.
3. Tại thư mục `desktop`, chạy `npm run device:smoke`. **Lệnh này chỉ kiểm tra sự có mặt và dung lượng EXE**, không thực hiện thay việc cài/chạy; phải làm bước 4.
4. Cài Setup và chạy Portable trên PC thật; kiểm tra trang login và cặp môi trường TEST `https://ktc-fe-test.nan978971.workers.dev` / `https://ktc-be-test.nan978971.workers.dev/api`; dùng tài khoản TEST đã được cấp. Không sử dụng nhầm profile production.
5. Tạo/chờ duyệt/duyệt báo cáo test có ID truy vết; mở Desktop, xuất Excel, đóng/mở lại Excel; thử công đoạn GC/MAI/DO/K1/K2/CAN/EP/XLBV/SX3, ca A/B/C/D nếu fixture hỗ trợ, cả lỗi NG và trừ giờ.
6. Chạy đối soát **chỉ đọc** trên bản sao thư mục xuất của tháng đã chọn:
   `node scripts/validateExcelFolder.cjs "<thu_muc_chua_file_thang>" YYYY-MM`
   (lệnh này cần đủ tập file tháng theo danh mục `PROCESS_SHEETS`; tháng không có đủ file sẽ FAIL).
7. Thử các lỗi thực tế: file Excel đang được mở, thiếu quyền ghi, mất mạng, token hết hạn, tải lại dữ liệu, sửa đồng thời. Không sửa trực tiếp DB production để dựng testcase.
8. Thử nâng cấp, uninstall/reinstall. Kiểm tra dữ liệu và file xuất đã được backup đúng; ghi lại phiên bản, kết quả và lỗi.
9. Với **bản phát hành đã ký** (không áp dụng cho staging unsigned), kiểm tra chữ ký bằng PowerShell `Get-AuthenticodeSignature "<duong_dan_exe>"`, yêu cầu `Status=Valid`; `npm run release:signing-check` chỉ kiểm tra cấu hình ký, **không chứng minh tệp đã được ký**.

## 4. Backup/restore trên DB staging cô lập

- Không truyền credentials thật vào GitHub issue, commit hoặc log công khai.
- Với backup đã được phép dùng, kiểm tra artifact offline từ thư mục `backend`:
  `npm run backup:drill -- "<backup_file>"`.
- **Chỉ khi có staging DB riêng và phê duyệt**, cấu hình `KTC_RESTORE_DB_HOST`, `KTC_RESTORE_DB_PORT`, `KTC_RESTORE_DB_USER`, `KTC_RESTORE_DB_PASSWORD`, `KTC_RESTORE_DB_NAME` cùng profile DB nguồn để kiểm tra khác biệt, rồi chạy:
  `npm run restore:rehearsal -- --file "<backup_file>"`.
- Script `rehearseDatabaseRestore.js` chặn target trùng host/port/name của DB nguồn và yêu cầu tên staging/restore/rehearsal/test/drill; **nhưng người chạy vẫn phải tự kiểm tra kỹ tên host và quyền truy cập**.
- Đối soát số bảng/bản ghi, report IDs, các phiên bản báo cáo, định mức lịch sử, số liệu máy dùng chung và phân quyền sau restore. Không cutover.

## 5. Điều kiện GO / NO-GO

**GO** chỉ khi cùng lúc có: CI 3/3 không flaky trên SHA cuối, hồi quy tổng hợp PASS trên cùng mã nguồn runtime, UAT PC thật PASS, Excel↔DB đối soát đạt, backup/restore rehearsal có bằng chứng, chữ ký phát hành hợp lệ và người chịu trách nhiệm phê duyệt.

Nếu bất kỳ điều kiện bắt buộc nào thiếu bằng chứng: **NO-GO production**. Giữ nhánh `refactor/ktc-local-cleanup` để kiểm thử, không merge/deploy hoặc can thiệp TiDB production.

## 6. Biên bản UAT cần điền

| Người thử | PC/Windows | Ngày/giờ | Build SHA + phiên bản | Testcase | PASS / FAIL / BLOCKED | Bằng chứng & lỗi |
|---|---|---|---|---|---|---|
| Chưa phân công | Chưa xác định | — | — | Cài Setup / Portable / Excel / backup-restore | BLOCKED | Chưa có test PC và staging DB được cấp phép |

**Ghi chú:** CI chỉ xác nhận phần kiểm thử tự động. Tài liệu này là hướng dẫn thao tác và tiêu chí nghiệm thu, **không phải bằng chứng UAT đã hoàn tất**.
