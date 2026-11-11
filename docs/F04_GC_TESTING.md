# F04 — GC / Gia công: kiểm thử cô lập vòng 1

Nhánh `test`; không sửa `main`, CI, deploy hay TiDB production.

## Phạm vi
- Công nhân GC nhập tối đa **4 máy khác nhau** trong một báo cáo.
- GC chế độ MACHINE dùng thời gian của từng dòng máy; không bắt buộc `actual_time` cấp báo cáo > 0.
- Kiểm tra giờ máy, giờ trừ, OK/NG, loại công việc CUT/LONG, định mức theo mã máy/sản phẩm và phiên bản định mức.
- Kiểm tra kết quả phân loại nguồn máy và không đếm trùng event trong **một báo cáo**.
- **Không xác nhận hay thay đổi** việc phân bổ sản lượng vật lý giữa nhiều công nhân dùng chung một máy; để sau theo yêu cầu.
- Giới hạn tổng giờ cộng dồn/ngày tiếp tục tắt theo F02/F03.

## Điểm cần xác nhận với nghiệp vụ trước khi sửa
`factoryMachineRuleService.js` hiện cho GC mặc định **4 công nhân/máy**, trong khi yêu cầu trước đó là **tối đa 2 công nhân/máy**. Vì quy tắc máy dùng chung được hoãn, **không sửa hoặc chứng nhận** quy tắc này ở F04.

`cutExecutionMode.js` có danh sách đặc biệt C5/C6/C7/C11; `factoryMachineRuleService.js` có danh sách máy tự động mặc định khác, có thể bị master `is_automatic` ghi đè. Cần xác nhận với dữ liệu master giả và UI trước khi thay đổi quy tắc.

## Lệnh kiểm thử CMD

```bat
cd /d F:\VSCode\worker-management-system
git switch test
git pull origin test
cd backend
node scripts/runFlowTests.cjs --flow gc-machine
cd ..\frontend
node --test tests\f02-machine-validation.test.cjs tests\gc-machine-work-type-master.test.cjs
npx tsc --noEmit
```

Đây là unit/contract tests không chủ động mở DB hay gọi API ngoài. Không chạy `gc-machine-time-integration.test.js` hoặc remote smoke tests vì chúng có thể cần kết nối dịch vụ/DB. Chưa có log thực thi nên chưa đánh dấu PASS.

## Kiểm thử thủ công/E2E còn thiếu
- Chọn đúng máy CUT/LONG theo master; máy không hợp lệ bị từ chối.
- Một công nhân chạy 1/2/4 máy, từ chối máy thứ 5.
- Thời gian máy mỗi dòng >0 và <=12h, giờ trừ không âm, không vượt thời gian gốc.
- Tổng OK + NG, chi tiết NG và mã lỗi phải hợp lệ.
- Định mức theo ngày báo cáo, máy, sản phẩm, loại công việc và học việc.
- Mất mạng giữa batch: giữ request ID và chỉ gửi lại phần chưa thành công (F02).
- Không đưa các trường hợp máy dùng chung nhiều công nhân vào tiêu chí PASS vòng này.
