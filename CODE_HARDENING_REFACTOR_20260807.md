# KTC Production Control — Code hardening & refactor 2026-08-07

Bản này tiếp tục từ `PROFESSIONAL-UI-BUTTON-SYSTEM-FINAL` và tập trung vào các vấn đề kiến trúc/bảo mật/khả năng bảo trì đã được audit, **không đổi nghiệp vụ sản xuất, endpoint public hiện có hoặc format Excel nghiệp vụ**.

## 1. Auth/session

- Web dùng refresh token qua cookie `HttpOnly`; request Axios bật `withCredentials`.
- Access token + user của web chuyển sang `sessionStorage`; Electron vẫn giữ body-token/localStorage fallback để tương thích `file://`.
- Refresh token lưu trong DB dưới dạng SHA-256 thay vì raw token.
- Có tương thích một phiên phát hành với refresh token raw cũ: lookup/revoke chấp nhận cả hash và raw, phiên mới luôn lưu hash.
- Logout thu hồi phiên và xóa cookie.
- Các page/hook không đọc token/user trực tiếp từ localStorage nữa; dùng `authStorage` tập trung.

## 2. Public health endpoint

`GET /api/health` chỉ trả trạng thái service/database. Không còn public `database_name`, `user_count` hoặc thông tin nội bộ không cần thiết.

## 3. Worker Process form

`ProcessPage.tsx` đã giảm từ khoảng 113 KB xuống khoảng 64 KB bằng cách tách:

- `processFormUtils.ts`
- `components/ProcessBasicInfoSection.tsx`
- `components/ProcessExtraFieldsSection.tsx`
- `components/ProcessNetworkGate.tsx`
- `components/ProcessWorkerHeader.tsx`
- `components/ProcessTimeDeductionSection.tsx`
- `components/ProcessQualitySection.tsx`
- `components/ProcessSubmitActions.tsx`

Page chính giữ orchestration/state để giảm rủi ro regression nghiệp vụ; rendering và pure utility đã được tách khỏi God component.

## 4. Backend production modules

`productionTempModel.js` và `productionTempController.js` trở thành facade nhỏ, logic được chia theo trách nhiệm:

### Models
- `productionTempCreateModel.js`
- `productionTempReadModel.js`
- `productionTempReviewModel.js`
- `productionTempApprovalModel.js`
- `productionTempUpdateModel.js`
- `productionTempHistoryModel.js`
- `productionTempModelShared.js`

### Controllers / service
- `productionTempWorkerController.js`
- `productionTempManagementController.js`
- `productionTempControllerUtils.js`
- `productionReportSideEffectsService.js`

Router/API hiện có tiếp tục require facade cũ nên không cần đổi contract.

## 5. Electron

`electron/main.cjs` được tách các helper độc lập:

- `desktopLog.cjs`
- `excelPaths.cjs`
- `authToken.cjs`

Desktop check script đã bao gồm các module mới.

## 6. Frontend robustness

- Thêm `AppErrorBoundary` cho lỗi renderer chưa bắt được.
- Thêm `RouteLoading` skeleton cho lazy routes.
- Chuẩn hóa shared button base classes trong design system.
- Routing dùng tên `Management*` cho component chia sẻ Admin/Manager/Lead thay vì alias `Lead*` gây hiểu nhầm.
- Có `prefers-reduced-motion` và screen-reader utility.

## 7. Automated checks mới

Frontend source-contract tests kiểm tra:

- không quay lại stacked legacy themes;
- button class literal có CSS tương ứng;
- API bật cookie credentials;
- page không bypass centralized auth storage;
- web auth giữ contract HttpOnly-cookie.

Backend có test mới cho:

- refresh token hash/storage;
- privacy của public health endpoint.

Build frontend có bundle budget check qua `scripts/checkBundleSize.cjs`.

## 8. Windows release

Workflow `build-windows.yml` giờ:

1. verify frontend/desktop;
2. build portable + installer;
3. tạo `SHA256SUMS.txt`;
4. upload artifact;
5. với tag `release-*`, tạo GitHub Release và đính kèm EXE + checksum.

## Verification đã chạy trong môi trường đóng gói

- TypeScript/TSX parser: **0 syntax errors**.
- Frontend source-contract tests: **5/5 pass**.
- Backend syntax check: **107 JavaScript files OK**.
- Backend tests: **64/64 pass**.
- Desktop syntax check: **PASS**.
- Frontend relative local imports: **0 missing**.
- CSS brace balance: **PASS**.

### Giới hạn môi trường đóng gói

Không thể chạy `npm ci`/full Vite typecheck-build trong sandbox vì npm registry nội bộ tại đây trả `404` cho `zod-validation-error@4.0.2`. Đây không phải lỗi source. Trên máy phát triển, bắt buộc chạy `npm run verify` trước commit/build EXE; script `COMMIT_AND_BUILD_EXE.cmd` đã dừng ngay nếu verify fail.
