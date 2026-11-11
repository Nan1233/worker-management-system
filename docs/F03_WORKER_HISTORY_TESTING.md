# F03 · Lịch sử, chi tiết, chỉnh sửa báo cáo công nhân (nhánh test)

## Chính sách tạm thời
- **TẮT** giới hạn công nhân chỉ sửa được trong vòng 10 phút. Chỉ cho công nhân sửa báo cáo tạm `pending`; báo cáo `rejected`, `approved`, `deleted` và trạng thái `need_fix` cũ đều chỉ được xem. `need_fix` đã bị loại khỏi bộ lọc lịch sử; dữ liệu cũ không bị tự động xóa hay thay đổi.
- Backend là nguồn xác nhận cuối cùng. Quyền sở hữu vẫn bắt buộc; FE chỉ hiển thị nút.
- Không cho phép sửa hoặc gửi lại `rejected`.
- Mọi thao tác công nhân sửa phải gửi `expected_updated_at`, thiếu hoặc phiên bản cũ bị từ chối HTTP 409 trước khi cập nhật dữ liệu.
- Giới hạn giờ **cộng dồn/ngày** tiếp tục tắt cho cả tạo và sửa theo quyết định F02; vẫn kiểm tra thời gian hợp lệ của từng dòng máy. Không sửa quy tắc máy dùng chung.

Để bật lại 10 phút trong tương lai: cùng lúc đổi `WORKER_EDIT_TIME_LIMIT_ENABLED` sang `true` ở:
- `backend/utils/workerEditWindowPolicy.js`
- `frontend/src/pages/worker/reportEditWindow.ts`

Sau khi bật lại, chạy đủ test chỉnh sửa theo thời gian và kiểm tra múi giờ DB. Không chỉ bật một bên.

## Đã chỉnh
- `ProductionReadonlyDetail.tsx`, `WorkerReportEdit.tsx`, `WorkerReportEditCallout.tsx`, `WorkerReportEditV2.tsx`: dùng chính sách thống nhất; bỏ đếm ngược, mở nút sửa khi được phép.
- `ProductionHistory.tsx`: key có nguồn `source` + `id` để không đụng giữa bảng tạm và bảng đã duyệt.
- `WorkerReportEditV2.tsx`: dùng `validateMachineLines` của form F02 cho dòng máy, nhận diện xung đột cập nhật `TEMP_REPORT_VERSION_CONFLICT`, báo cần tải lại và giữ nội dung trên form.
- `productionTempUpdateModel.js`: giữ SELECT ... FOR UPDATE, kiểm tra chủ báo cáo, trạng thái được sửa và bắt buộc phiên bản với worker; bỏ duy nhất điều kiện thời gian khi flag tắt.

## Kiểm thử cô lập, Windows CMD

```bat
cd /d F:\VSCode\worker-management-system
git switch test
git pull origin test
cd backend
node scripts/runFlowTests.cjs --flow worker-history
cd ..\frontend
node --test tests\worker-edit-window.behavior.test.cjs tests\f03-worker-history-contract.test.cjs tests\worker-history-states.contract.test.cjs tests\report-edit-parity.test.cjs
npx tsc --noEmit
```

Lưu ý: `temp-edit-regressions.test.js` tạo một HTTP server **cục bộ** qua `127.0.0.1`, sử dụng fake DB đã mock và token giả. Không kết nối TiDB production. Không chạy `npm test` toàn bộ trước khi kiểm tra các bài integration/smoke khác.

## Tình huống kiểm tra thêm trước khi chốt production
1. Mở cùng báo cáo `pending` ở hai tab A và B. A sửa lưu thành công; B gửi bản cũ phải nhận 409, không ghi đè.
2. Công nhân A mở báo cáo của B phải bị từ chối.
3. Báo cáo `rejected` luôn bị chặn sửa; `need_fix` cũ cũng bị chặn.
4. Báo cáo `approved` vẫn chỉ xem.
5. Form sửa máy/NG/trừ giờ khớp validation F02.
6. Lịch sử chứa `temp id=1` và `approved id=1` vẫn hiển thị hai dòng độc lập.

**Trạng thái:** Code và các bài test đã được commit lên nhánh `test`; chưa có log xác nhận test đã chạy trên checkout đầy đủ. Không deploy, không bật CI, không sửa `main`.
