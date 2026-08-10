# KTC UI/UX Rework 2026-08-10

Lần chỉnh này xử lý trực tiếp stylesheet canonical thay vì chồng thêm một theme override.

## Đã chỉnh
- `frontend/src/styles/ktc-professional.css`: palette #2563eb, radius 6/8/10/12, shadow và focus nhẹ hơn, sidebar width gọn hơn.
- `frontend/src/layouts/ManagementLayout.css`: sidebar trắng, active xanh mềm, header trắng sticky, mobile navigation phẳng.
- `frontend/src/pages/worker/SelectProcess.css`: process card gọn, 3 cột desktop / 2 tablet / 1 mobile, bỏ card/icon oversized.
- `frontend/src/pages/worker/ProcessPage.css`: giảm radius/shadow/padding, form compact hơn nhưng giữ nguyên flow.
- `frontend/src/pages/manager/Dashboard.css`: giảm tiêu đề/KPI/card quá lớn, dùng elevation nhẹ.
- `frontend/src/pages/Login.css`: giảm showcase trang trí, bỏ gradient phức tạp, dùng xanh doanh nghiệp phẳng hơn.

## Không thay đổi
- Backend/API
- Route/flow
- RBAC/permission
- process assignment
- multi-machine
- NG/deduction
- training %
- report/entry date
- approval/governance
- Excel logic

## Kiểm tra
`node --test frontend/tests/*.test.cjs`: 11/11 PASS.
