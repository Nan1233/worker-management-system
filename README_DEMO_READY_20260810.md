# KTC Production Control — Demo Ready 10/08/2026

Bản này được tạo trực tiếp trên 3 source mới nhất người dùng cung cấp ngày 10/08/2026 (`frontend`, `backend`, `desktop`).

## 1. Nhóm sửa giao diện + phạm vi dữ liệu

- Giao diện quản lý/công nhân có nút Sáng/Tối, lưu lựa chọn bằng `localStorage.ktcTheme`.
- Bổ sung biến màu dark theme và override các card/table/input/message để đổi theme không làm mất chữ/dữ liệu.
- Responsive tốt hơn cho laptop/tablet/mobile; bảng báo cáo cuộn ngang an toàn trên màn hình nhỏ.
- Menu `Xuất báo cáo` bị ẩn với Manager/Lead; URL cũ `/manager/export` và `/lead/export` tự chuyển sang `Đã duyệt`.
- `Báo cáo đã duyệt` có cùng tư duy lọc thời gian với `Chờ duyệt`: hôm nay, hôm qua, tuần này, tháng này, chọn tháng, khoảng ngày, tất cả ngày.
- `Phạm vi dữ liệu` chỉ là dữ liệu đang hiển thị trên web. Nó KHÔNG giới hạn dữ liệu Excel.
- Excel có bộ chọn `Tháng cập nhật Excel` riêng. Chỉ cần chọn tháng rồi bấm `Cập nhật Excel`; Desktop/backend lấy toàn bộ báo cáo `approved` của tháng.
- Công thức có phạm vi theo `Công đoạn + Hiệu lực từ/đến`.
- Các phiên công thức cũ được lưu trong `production_formula_setting_versions`; Excel nhận cấu hình theo từng ngày báo cáo, nên nếu công thức đổi giữa tháng thì từng dòng vẫn dùng đúng công thức theo ngày.
- Trang `Quản trị dữ liệu` không còn để một API 500 làm hỏng toàn màn hình: dùng `Promise.allSettled`, phần nào tải được vẫn hiển thị và thông báo lỗi thân thiện.
- Backend tự bảo đảm các bảng governance cần thiết tồn tại.

## 2. Nhóm sửa lịch sử phiên bản + audit

- `activity_logs`: ghi nhật ký các thay đổi API thành công (POST/PUT/PATCH/DELETE), có user, role, entity, payload đã che secret, IP, user-agent, thời gian.
- Login/logout vẫn dùng semantic audit riêng có sẵn.
- `report_versions`: snapshot đầy đủ báo cáo approved, gồm báo cáo + NG + thời gian trừ.
- Báo cáo cũ chưa từng có version: lần đầu mở lịch sử sẽ tự tạo `V1 - Phiên bản cơ sở` để demo/so sánh được ngay.
- Khi sửa approved report, hệ thống tạo version và audit.
- Khi xóa approved report: soft-delete (`status=deleted`), không mất dữ liệu; có version trước/sau xóa và log `REPORT_DELETED`.
- `Hệ thống > Dữ liệu đã xóa`: xem danh sách báo cáo đã xóa.
- `Chi tiết báo cáo > Lịch sử phiên bản`: xem V1/V2/..., người tạo, thời gian, lý do, so sánh với hiện tại.
- Khôi phục version KHÔNG xóa lịch sử mới hơn; hệ thống tạo một version mới với action `REPORT_RESTORED`.
- Manager/Admin có thể restore khi kỳ chưa khóa; period lock vẫn được tôn trọng.
- `Hệ thống > Nhật ký thay đổi`: lọc theo từ khóa, action, từ ngày/đến ngày và xem metadata.

## 3. Database / migration

Migration mới:

`backend/migrations/010_audit_governance_demo.sql`

Nó tạo các bảng hỗ trợ audit/version/governance/formula history. Vì schema KTC cũ dùng ENUM cho `production_reports.status` và không có `deleted`, migration nới riêng cột này thành `VARCHAR(30)` để soft-delete an toàn.

Runtime cũng có cơ chế compatibility trong `auditService.ensureSchema()` và formula/governance services.

## 4. Lệnh chạy TRƯỚC DEMO (Windows CMD)

Tại repo chính:

```cmd
cd /d C:\VSCode\worker-management-system

npm --prefix backend run db:migrate
npm --prefix backend run db:demo-schema

npm --prefix frontend run typecheck
npm --prefix frontend run build

npm --prefix backend run verify
npm --prefix desktop run check
npm --prefix desktop run smoke:excel

npm run verify
```

Nếu tất cả pass, commit/push:

```cmd
git status
git add frontend backend desktop
git commit -m "Add demo UI scopes audit and report version restore"
git push origin main
```

Sau khi Render deploy xong: `Ctrl + Shift + R` hoặc mở cửa sổ ẩn danh.

## 5. Kịch bản demo nhanh 3–5 phút

1. Đăng nhập Manager.
2. Bấm nút Sáng/Tối ở header; chuyển vài màn hình để chứng minh dữ liệu vẫn đọc được.
3. Mở `Đã duyệt` → chọn `Tháng này`, `Chọn tháng` hoặc `Khoảng ngày`.
4. Chỉ vào khối `Tháng cập nhật Excel` và giải thích: filter web không ảnh hưởng Excel; Excel luôn lấy toàn bộ approved của tháng.
5. Mở `Công thức` → chọn công đoạn → chọn `Hiệu lực từ/đến` → lưu.
6. Mở một báo cáo đã duyệt → `Lịch sử phiên bản` → chọn V1/V2 để so sánh → khôi phục một phiên bản (nhập lý do).
7. Mở `Hệ thống` → `Nhật ký thay đổi` để thấy người/action/time/IP/metadata.
8. Nếu muốn demo xóa: xóa một báo cáo test → `Hệ thống > Dữ liệu đã xóa` → mở lại report → restore version trước khi xóa.
9. Mở `Quản trị dữ liệu`: nếu một nguồn dữ liệu phụ lỗi, trang vẫn hiển thị các phần còn dùng được thay vì raw `Request failed with status code 500`.

## 6. Kiểm tra đã thực hiện trong môi trường tạo bản sửa

- Backend `npm test`: **85/85 pass**.
- Backend `npm run check`: **Syntax OK: 117 JavaScript files**.
- Desktop `npm run check`: **pass**, gồm `Excel <-> DB source contract OK`.
- TypeScript source mới đã được parse/transpile: **0 syntax diagnostics**.
- Không thể chạy frontend production build/smoke Excel đầy đủ trong môi trường đóng gói vì ZIP người dùng không chứa `node_modules` và registry nội bộ thiếu một package. Trên máy người dùng đã có dependencies, bắt buộc chạy các lệnh mục 4 trước khi push.

## 7. Lưu ý an toàn khi demo

- Dùng báo cáo test để demo xóa/restore.
- Restore/xóa bị chặn nếu tháng đã khóa.
- Audit theo dõi thay đổi đi qua API ứng dụng; chỉnh DB trực tiếp ngoài ứng dụng không thể tự biết danh tính người thao tác ứng dụng.
- Không dùng `git add .` nếu repo còn file `.bak`, `.exe`, `release/` hoặc `node_modules/` ngoài ignore; dùng `git add frontend backend desktop` như hướng dẫn và kiểm tra `git status` trước commit.

## 8. UI/UX professional normalization bổ sung

- Thêm `frontend/src/styles/ktc-demo-ui.css`, được import cuối trong `main.tsx` để làm lớp design-system cuối cùng, không thay business logic.
- Chuẩn hóa primary xanh dương `#2563eb`, surface, text, border, radius 4–12px, shadow nhẹ và spacing token.
- Sidebar quản lý giữ nguyên cấu trúc/width/menu/RBAC nhưng đổi sang skin doanh nghiệp sáng; dark mode có override tương phản riêng.
- Chuẩn hóa input/select/textarea/button/card/modal/table theo cùng hệ token.
- Responsive chia rõ desktop/laptop/tablet/mobile; tablet vẫn ưu tiên 2 cột khi đủ chỗ, mobile dùng control tối thiểu 44px và 16px cho input.
- Bảng giữ nguyên table trên mobile, cuộn ngang; không ép nhiều cột vào 360–430px.
- Selected Reports Review chỉ sticky STT + Mã NV + Tên; nền/z-index/shadow phân cách được chuẩn hóa để tránh xuyên chữ khi scroll/Windows scale.
- Cột/ngõ nhập ngày được giữ min-width đủ đọc `dd/mm/yyyy`, ưu tiên scroll thay vì cắt dữ liệu.
- Không sửa backend, API, RBAC, permission, công thức, NG/trừ giờ, multi-machine, process assignment hoặc Excel logic.

### Kiểm tra trong môi trường đóng gói

- `node --test frontend/tests/*.test.cjs`: **11/11 pass** sau thay đổi UI.
- CSS structural check: **pass**.
- `npm ci` không hoàn tất do registry nội bộ không có `zod-validation-error@4.0.2`, vì vậy production `tsc/vite build` vẫn cần chạy trên máy dự án có dependencies đầy đủ.
