# P0 Production Calculation Engine - 2026-08-10

## Mục tiêu
Đưa công thức sản xuất về một contract duy nhất để API, Excel và Desktop không tự tính khác nhau.

## Thay đổi chính
- Thêm `backend/domain/productionCalculationEngine.cjs` làm engine chuẩn phía backend.
- Thêm mirror runtime `desktop/electron/productionCalculationEngine.cjs` cho EXE standalone.
- Có regression test bắt buộc hai engine phải byte-identical.
- `companyExcelDataController` tính `calculationSnapshot` cho từng báo cáo bằng cấu hình công thức đúng ngày hiệu lực.
- `monthlyWorkbookLocal.cjs` ưu tiên `report.calculationSnapshot`; chỉ dùng engine local khi cần fallback.
- Giữ chính xác `training_percent = 0` thành 0%, chỉ default 100% khi thiếu/rỗng/không hợp lệ.
- KQD chỉ bị loại khỏi counted NG khi `exclude_kqd_from_tt = 1`.
- Hỗ trợ `DATABASE_SNAPSHOT`, `WORKING_MINUS_DEDUCTION`, `MACHINE_LINES_SUM` cho TG thực tế.
- Multi-machine giữ aggregate snapshot đã validate (`counted_output`, `maximum_output`).

## Test đã thêm
- 0% học việc.
- Missing training -> 100%.
- KQD include/exclude.
- Công thức TG thực tế.
- Multi-machine snapshot.
- Backend/Desktop engine contract.
- Backend `calculationSnapshot` -> Desktop ưu tiên snapshot.

## Kết quả kiểm tra trong workspace
- `npm --prefix backend test`: 93/93 PASS.
- `npm --prefix backend run check`: PASS.
- `npm --prefix desktop run check`: PASS phần syntax/source contract.
- `smoke:excel` chưa thể chạy trong sandbox vì ZIP không chứa dependency `exceljs` và npm registry sandbox thiếu `zip-stream@4.1.1`.
- Frontend typecheck chưa thể chạy vì dependency trong ZIP thiếu `vite/client` và `@types/node`.

## Lệnh chạy trên máy dự án
```cmd
cd /d C:\VSCode\worker-management-system
npm run install:all
npm run verify
npm run build:exe
```
