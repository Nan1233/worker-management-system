# KTC packaged shared contract fix — 2026-08-11

- Nguyên nhân: Electron source dùng `../../shared/excelSyncContract.cjs`; khi chạy từ `app.asar/electron`, đường dẫn runtime tương ứng là `resources/shared/excelSyncContract.cjs`.
- Fix: `desktop/package.json > build.extraResources` copy đúng contract từ `../shared` sang `resources/shared`.
- Thêm `desktop/scripts/checkPackagedSharedContract.cjs` vào `npm --prefix desktop run check` để CI/verify bắt lỗi nếu contract không được đóng gói.
- Không nhân bản contract; backend và desktop vẫn dùng cùng một file nguồn `shared/excelSyncContract.cjs`.
