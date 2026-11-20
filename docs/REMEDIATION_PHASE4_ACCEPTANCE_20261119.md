# KTC — Giai đoạn 4: Nghiệm thu CI cô lập (cập nhật 2026-11-20)

**Nhánh:** `refactor/ktc-local-cleanup` · **Source SHA đã kiểm thử:** `444fb3c6137a7f243bc4b664579658b7d8cf643c`.

## Kết quả 3/3 trên cùng source SHA

**GitHub Actions:** [run 44657214339](https://github.com/Nan1233/worker-management-system/actions/runs/44657214339) — **SUCCESS**.

| Cổng | Kết quả cuối | Bằng chứng |
|---|---|---|
| Part 1 — Backend HTTP + TiDB UniStore cô lập | **PASS** | HTTP integration, approved-edit concurrency, historical KPI snapshot, RBAC |
| Part 2 — Browser authenticated + TiDB cô lập | **PASS** | Playwright **22 passed, 0 flaky, 0 failed**; desktop/mobile Chromium, worker/lead/manager/admin |
| Part 3 — Windows NSIS + Portable staging | **PASS** | Windows regression, build hai tệp EXE staging unsigned và xác nhận chúng tồn tại |

Đây là kết quả kiểm thử **bản build trong CI**, không phải chứng nhận production hoặc kết quả cài đặt trên PC KTC thật.

**Hồi quy bổ sung:** [Phase 2 consolidated run 44655720753](https://github.com/Nan1233/worker-management-system/actions/runs/44655720753): **6/6 jobs SUCCESS**, trên SHA `7138299826c4da588513f48a19ca14833a5db1f0`. Những commit sau SHA này cho đến source SHA Giai đoạn 4 chỉ điều chỉnh file test E2E; không thay đổi mã runtime.

## Vấn đề đã sửa và nghiệm thu bằng CI

1. Sửa `managerApprovedReportsController` không còn truy vấn cột `production_reports.tt_dinh_muc` vốn không có trong schema canonical. Giá trị mục tiêu được tính từ dữ liệu giờ và định mức snapshot đã lưu tại báo cáo/dòng máy; bổ sung HTTP integration với schema thật, phạm vi quyền manager.
2. Sửa form chi tiết duyệt: ưu tiên **ID báo cáo chính xác** từ URL, từ chối dữ liệu sai ID hoặc ngày, không tự chọn báo cáo khác khi thiếu key. Điều này bảo vệ chống thao tác duyệt/từ chối nhầm.
3. Cô lập user/worker test theo browser project và retry; chạy mobile viewport trên Chromium đã cài trong CI thay vì yêu cầu WebKit không được cài.
4. Sửa Playwright theo luồng UI thực tế: điều hướng Lead/Manager/Admin, bắt buộc lý do sửa báo cáo đã duyệt, lựa chọn report theo ID và deep link, kiểm tra TT OK được gửi trong PUT và thực sự lưu tại backend.
5. Xử lý trùng thông báo KTC Desktop và cố định điều kiện chờ tải danh mục trước khi mở modal Admin. Lượt CI cuối **22/22 ngay lần đầu**, không dựa vào retry.
6. Giữ kiểm chứng Windows staging NSIS/Portable và hồi quy Excel cô lập, không ký/phân phối sản phẩm.

## Những cổng vẫn phải nghiệm thu ngoài CI

Các mục sau **chưa đạt đủ bằng chứng**, dù 3/3 cổng CI đã PASS:

- **Windows thiết bị thật:** cài Setup, chạy Portable, đăng nhập đúng endpoint TEST, mở/sửa/lưu Excel, đóng/mở lại, nâng cấp, gỡ cài đặt và kiểm tra dữ liệu người dùng không bị mất. **Chưa thực hiện trên PC KTC thực tế.**
- **Ký số phát hành:** EXE staging là **unsigned**. Chưa có bằng chứng chữ ký Authenticode tin cậy và hành vi Windows SmartScreen trên PC đích. Không phát hành các EXE staging dưới dạng production.
- **Excel–DB hai chiều trên dữ liệu thật được cấp phép:** kiểm tra dữ liệu được duyệt -> workbook tháng đúng công đoạn -> sửa/import theo quyền -> đối soát dòng/số liệu với DB; thử xung đột cập nhật, backup và phục hồi workbook. Hiện chỉ có bài kiểm tra cô lập/synthetic.
- **DB và Cloudflare production:** xác minh secret/runtime profile, migration/schema thực tế, backup/restore và đối soát dữ liệu bằng quy trình có phê duyệt. CI chỉ tạo database `ktc_it_*` tạm; **không kết nối/sửa DB thật**.
- **Nghiệm thu nghiệp vụ mở rộng:** dữ liệu seed đầy đủ cho mọi công đoạn, offline/draft, phân quyền chi tiết, responsive và visual regression, và kịch bản lỗi mạng. Bộ E2E hiện tại kiểm tra tập luồng quan trọng chứ không thay thế nghiệm thu tổng thể.

## Kết luận và giới hạn an toàn

- **Phase 4 — isolated CI acceptance: PASS (3/3, browser 22/22 non-flaky).**
- **Production release gate: NO-GO / chưa đủ bằng chứng**, đợi các mục nghiệm thu thiết bị, dữ liệu và vận hành ở trên.
- Nhánh `refactor/ktc-local-cleanup` vẫn là **nhánh TEST**. **Không merge, không deploy, không sửa DB production** trong quá trình nghiệm thu này.
- Commit cập nhật tài liệu sau source SHA kiểm thử chỉ thay đổi báo cáo, không sửa mã runtime; kết quả CI được gắn với source SHA nêu ở đầu.
