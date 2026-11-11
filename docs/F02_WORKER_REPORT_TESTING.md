# F02 — Công nhân nhập báo cáo: thay đổi và kiểm thử cô lập

Nhánh: `test`. Không thay đổi `main`, production, CI, deploy hoặc TiDB.

## Quyết định nghiệp vụ giữ nguyên

- Giới hạn **cộng dồn giờ của nhiều báo cáo trong một ngày** chưa được bật (`DAILY_HOURS_ENFORCEMENT_ENABLED=false`).
- Kế toán máy dùng chung / nhiều công nhân được hoãn; không sửa logic sản lượng vật lý và tín chỉ công nhân.
- Giới hạn thời gian **của từng dòng máy** và sự nhất quán NG/OK vẫn cần validation theo backend.

## Thay đổi

1. Offline queue: xác minh bản ghi bằng cách đọc lại `localStorage` sau khi lưu; nếu thất bại, không được thông báo đã lưu an toàn. Giữ nguyên tất cả mã `client_request_id` để retry không tạo trùng.
2. Offline queue: nếu `client_request_id` đã tồn tại nhưng payload khác thì báo lỗi và không ghi đè/bỏ qua âm thầm.
3. Draft autosave: không ghi đè bản nháp hỏng hoặc thuộc công nhân khác; cảnh báo trên form khi autosave gặp lỗi ghi/đọc; kiểm tra việc đọc lại sau ghi.
4. Frontend validation: bổ sung số nguyên không âm cho OK/NG, thời gian máy thực tế >0 và <=12h, giờ thực tế cộng trừ giờ <=12h, kiểm tra NG chi tiết cho máy GC và các công đoạn có dòng máy. Backend tiếp tục là nguồn quyết định cuối cùng.
5. Giữ nguyên luồng `ProcessPage` dùng `enqueueOfflineReports(payloads.slice(index))` khi mất kết nối ở giữa batch. Bộ test kiểm tra phần còn lại được xếp hàng, ID không thay đổi và lượt đã thành công không bị gửi offline lại.

## Chạy trên Windows (CMD) sau khi pull test

```bat
git switch test
git pull origin test
cd backend
node scripts/runFlowTests.cjs --flow worker-entry
cd ..\frontend
node --test tests\phase5-offline-atomic-batch.test.cjs tests\offline-queue-flush-races.test.cjs tests\phase5-duplicate-split-offline-recovery.test.cjs tests\f02-draft-storage-regression.test.cjs tests\f02-machine-validation.test.cjs
npx tsc --noEmit
```

Có thể chạy thêm nhóm tương thích offline:

```bat
node --test tests\offline-reliability.test.cjs tests\offline-queue-check-similar.test.cjs tests\offline-any-network.contract.test.cjs
```

Đây là unit/contract test sử dụng storage và API mock; chưa chứng minh E2E toàn trang hay backend transaction với DB test. Các flow dùng chung máy nhiều công nhân và cộng dồn giờ/ngày bị loại khỏi phạm vi xác nhận F02 theo quyết định hiện tại. Nếu có FAIL, giữ log và chưa merge hay deploy.
