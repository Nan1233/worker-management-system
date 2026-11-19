# KTC — Giai đoạn 4: Đối chiếu nghiệm thu thực tế

Ngày kiểm tra: 2026-11-19. Nhánh `refactor/ktc-local-cleanup`.

## Nguồn bằng chứng

GitHub Actions [run 44557146844](https://github.com/Nan1233/worker-management-system/actions/runs/44557146844), commit `0376fc27c08e9ddf154b2a5e29047b6ee746410a`.

- **Backend HTTP + TiDB cô lập**: job `Part 1 - isolated TiDB HTTP and transactions` **SUCCESS**. Có thực thi bộ HTTP integration và kiểm thử concurrency, historical KPI, RBAC. Chỉ có giá trị trong database dựng tạm `ktc_it_*`.
- **Windows NSIS + Portable staging**: job `Part 3 - Windows NSIS and portable staging packages` **SUCCESS**. Đã xác nhận build EXE kiểm thử trên Windows, không ký chứng thư phát hành.
- **Playwright authenticated browser**: tại lần đối chiếu ban đầu **IN PROGRESS**, chưa được ghi nhận PASS; kiểm tra lại job thực tế trước khi kết luận.
- Bộ CI focused trước đó: run `44521176545` **6/6 SUCCESS** trên commit `18fe0847` (không thay thế cho E2E mới).

## Những lỗi đã xử lý trong các lượt 3 phần

- Dựng isolated TiDB từ canonical snapshot bị thiếu bảng `report_edit_proposals`, khôi phục từ migration 028 vào test fixture.
- Thiếu các cột schema `encoding_code`, `updated_by`, `standard_source` (migration 060), thông báo và phân loại máy GC (027/036/059); khôi phục **chỉ trong database cô lập**, không thực thi migration lên cơ sở dữ liệu thật.
- Bài test API cũ chưa truyền `expected_updated_at` và lý do chỉnh sửa, gây lỗi 409/422; đã điều chỉnh dữ liệu kiểm thử.
- Tách chính sách giờ làm/ngày và sửa báo cáo hiện đang tắt theo yêu cầu nghiệp vụ khỏi kiểm thử phiên bản cũ, đồng thời kiểm tra nhánh chính sách trong môi trường kiểm thử.
- Sửa bộ kiểm thử Excel khi ô công thức lưu giá trị cache không phản ánh phép tính; kiểm tra nguồn dữ liệu để không bỏ qua lỗi.

## Giới hạn nghiệm thu

Đây là **kiểm chứng cô lập**, không phải kiểm chứng sản xuất. Không có bằng chứng trong lượt chạy này về:
- Thử cài đặt/ký số Authenticode tin cậy, cập nhật và gỡ cài đặt trên PC thật.
- Đồng bộ hai chiều Excel–DB trên dữ liệu nghiệp vụ được cấp phép.
- Nghiệm thu toàn bộ UI gồm offline/draft, từng quyền với dữ liệu seed đầy đủ, responsive/visual regression.
- Khôi phục backup và đối soát dữ liệu production.

**Release gate: NO-GO** cho tới khi toàn bộ bằng chứng bắt buộc được xác nhận theo cùng một source SHA và có phê duyệt triển khai. Không merge, deploy, hoặc sửa production DB.
