# KTC — Hạng mục 1/12 · Clean code đợt 6: Desktop Excel và đồng bộ DB

**Ngày:** 20/11/2026  
**Nhánh:** `refactor/ktc-local-cleanup`  
**Runtime refactor SHA:** `50b60a666e5c3d2ad6446512f44a4386912e2868`  
**CI workflow-source gate SHA:** `66819135d890798295ced15168bdf779052e669d`

## Đã thực hiện

1. Chuyển **154 dòng mã nguồn chuẩn hóa dữ liệu Excel** khỏi `desktop/electron/excelDbSync.cjs` (508 → khoảng 393 dòng) sang module thuần `desktop/electron/excelDbSyncValues.cjs`.
2. Giữ toàn bộ hành vi hiện tại của các hàm:
   - `asText`, `asNumber`, `asInteger`: text, số và cached result của ô ExcelJS;
   - `stableValue`, `same`, `comparable`, `fieldValue`: đối chiếu bản ghi, tránh false diff do thứ tự khóa/NG;
   - `normalizeOperationMode`, `normalizeOperationType`, `excelDateToIso`: CẮT/LỒNG, TAY/MÁY và ngày;
   - `detailColumns`, `normalizeDetailList`, `mergeEditableDetails`, `normalizeEditable`: trường có thể chỉnh, NG/trừ giờ, % học việc, SL OK, thời gian thực tế.
3. `excelDbSync.cjs` tiếp tục quản lý đọc/ghi workbook, `_KTC_SYNC`, phát hiện trùng ID, ngăn việc đổi dòng/mã công nhân trong mẫu giấy, xem trước diff, `expected_updated_at`, các dòng mới và lỗi đồng bộ. Không thay những phần đó.
4. Bảo lưu `_private` API trong `excelDbSync.cjs` cho test và consumer cũ; module Excel mới được đóng gói nhờ `electron/**/*` trong cấu hình Electron.
5. Thêm `desktop/tests/excel-sync-values-refactor.test.cjs` với **6 test** chạy thật hàm/module thuần: cached formula, ngôn ngữ TAY/MÁY CẮT/LỒNG, dữ liệu NG bị ẩn trong DB, blank/zero, giá trị NG/trừ giờ sai định dạng fail-closed, CVK/máy, phép so sánh và public compatibility.
6. Cập nhật `desktop/scripts/checkExcelDbSync.cjs` để kiểm tra các guard ở đúng file module mới; thêm lệnh chạy script này và syntax check helper vào CI. Hai workflow được cấu hình theo dõi file mới.

### Điều kiện an toàn được giữ nguyên

- Nếu workbook không có cột tương ứng một lỗi NG/trừ giờ trong DB, **không xóa chi tiết DB**; cột có blank/zero mới xóa đúng loại tương ứng theo quy tắc cũ.
- NG nguyên không được nhập âm, thập phân hoặc giá trị không hợp lệ; lỗi `EXCEL_SYNC_INVALID_DETAIL_VALUE` vẫn giữ mã/chi tiết lỗi.
- Với báo cáo máy, các thay đổi SL OK, TG thực tế, NG và trừ giờ vẫn phải xuất hiện trong preview.
- Không ghi DB trực tiếp: UI xem trước/áp dụng thủ công, kiểm soát version, phân quyền và tính toán ở backend giữ nguyên.
- Không thay dữ liệu `_KTC_SYNC`, mapping report ID/row/stt, sheet công đoạn, worksheet veryHidden, các mẫu Workbook1, Excel export hoặc file đích.

## Bằng chứng kiểm thử

| Bộ | GitHub Actions run | Kết quả |
|---|---|---|
| Hồi quy sau refactor | [44692950603](https://github.com/Nan1233/worker-management-system/actions/runs/44692950603) | **6/6 SUCCESS** gồm Desktop unit/XLSX parity, Frontend, Backend, Windows, Browser |
| Nghiệm thu trên mã nguồn refactor | [44692950699](https://github.com/Nan1233/worker-management-system/actions/runs/44692950699) | **3/3 SUCCESS**, TiDB HTTP cô lập, E2E **22 passed/0 flaky**, Windows Setup/Portable staging |
| CI có thực thi script kiểm tra sync mới | [44693202536](https://github.com/Nan1233/worker-management-system/actions/runs/44693202536) | **6/6 SUCCESS**, step “Check manual Excel to DB review/identity guard” **PASS** trên cùng runtime; thay đổi so với SHA refactor chỉ ở workflow CI |

Các dữ liệu Excel được đối chiếu trong CI là **synthetic/fixture XLSX**; không có bằng chứng chạy với dữ liệu lưu trữ thật của KTC, không dùng production DB, chưa xác minh trên thiết bị Windows ở nhà máy.

## Trạng thái và tiếp theo

- **Đợt 6/8: PASS cổng CI đã định**, chỉ trong phạm vi chuẩn hóa giá trị Excel và hợp đồng đồng bộ.
- **Hạng mục 1/12: 6/8 đợt** theo kế hoạch, chưa hoàn tất clean toàn repository.
- **Đợt 7:** Clean Electron startup/IPC, cấu hình và an toàn môi trường triển khai; bảo vệ API preload/đường dẫn/không lộ token.
- **Đợt 8:** kiểm tra code lặp, module lớn, xóa mã thừa có bằng chứng, chạy toàn bộ gate và lập backlog/refactor tiếp.
- Kết quả kiểm thử tự động **không thay thế** nghiệm thu đối soát Excel ↔ TiDB trên staging có dữ liệu được phép, thử backup/restore, thử Setup/Portable trên PC công ty, ký số và kế hoạch rollback.

**Không merge main, không deploy Cloudflare, không sửa production DB.**
