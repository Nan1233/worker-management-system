# KTC Professional UI Redesign — 07/08/2026

## Mục tiêu
- Giữ nguyên nghiệp vụ và form dữ liệu.
- Thiết kế lại toàn bộ ngôn ngữ giao diện theo hướng enterprise, tối giản, rõ cấp bậc.
- Ổn định ở desktop, Electron, tablet và mobile; giảm phụ thuộc vào zoom cụ thể.
- Loại bỏ CSS patch chồng lớp và giảm mạnh `!important`.

## Thay đổi chính
1. Thay 3 theme cũ (`ktc-unified-theme`, `worker-visual-refresh`, `ktc-balanced-blue`) bằng `styles/ktc-professional.css`.
2. Tạo design token thống nhất: brand, ink, surface, border, radius, shadow, focus, spacing/layout constants.
3. Thiết kế lại Login: desktop split layout, hierarchy rõ, form gọn, responsive mobile riêng.
4. Thiết kế lại Worker navigation: topbar desktop, floating bottom nav mobile, safe-area support.
5. Viết lại ProcessPage CSS: một hệ sticky/fixed duy nhất, form cards, shift controls, machine lines, quality summary, NG/deduction controls, save bar.
6. Thiết kế lại Management shell: sidebar tối chuyên nghiệp, active indicator, user card, mobile bottom navigation có label.
7. Thiết kế lại Pending Reports: filter hierarchy, action hierarchy, table density, responsive filter layout, dialogs.
8. Thiết kế lại Production History theo cùng design system.
9. Chuẩn hóa Select Process, Dashboard, Admin, Formula và System Center qua global design system.
10. Dọn global reset và PWA safe-area; bỏ các full-width `!important` cũ.

## Kết quả kỹ thuật
- `!important` active CSS: ~625 -> 19.
- Tổng CSS: ~10.000+ dòng -> ~3.300 dòng.
- Không còn import tới 3 theme patch cũ.
- CSS brace validation: PASS.
- Local CSS import validation: PASS.

## Ghi chú kiểm thử
`npm ci` trong môi trường kiểm tra bị chặn bởi registry nội bộ thiếu package `zod-validation-error@4.0.2`, nên không thể hoàn tất TypeScript/Vite build tại đây. Lỗi này xảy ra ở bước tải dependency, trước khi compiler chạy, không phải lỗi source được phát hiện từ redesign.

Trên máy dự án, chạy:

```bat
cd /d C:\VSCode\worker-management-system\frontend
npm ci
npm run typecheck
npm run build
```

Sau đó kiểm tra UI ở Chrome/Electron với zoom 80%, 90%, 100%, 110%, 125% và Windows Scale 100%/125%.
