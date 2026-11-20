# KTC · Hạng mục 2/12 — Kiểm thử nghiệp vụ toàn diện · Đợt 1 (ma trận nền và API phân quyền)

**Ngày:** 20/11/2026  
**Nhánh:** `refactor/ktc-local-cleanup`  
**Runtime matrix SHA:** `cc9bfd16f78649a23a9cc18611b2c66c040a263e`  
**Runtime TiDB integration SHA:** `4667f31a7870c498c226054ffdff21aac5789575`

## 1. Mục tiêu và phạm vi

Kiểm tra bằng **logic sản xuất đang chạy thật**, không sao chép lại công thức nghiệp vụ vào test. Giai đoạn này tập trung vào:
- 9 công đoạn **GC, MAI, DO, K1, K2, CAN, EP, XLBV, SX3**;
- 4 ca **A, B, C, D**, tổng 36 tổ hợp;
- chuỗi nhập số, OK/NG/KQD, trừ giờ và giới hạn 12h, KPI/định mức;
- giới hạn máy đã cấu hình và split báo cáo nhiều máy;
- quyền **admin, manager, lead, worker**;
- giờ sự kiện máy vật lý dùng chung chỉ tính một lần;
- API pending và reject trong **TiDB thật nhưng hoàn toàn cô lập**, không sử dụng TiDB KTC.

## 2. Test bổ sung

### A. 9×4 validation/KPI/quyền — test thực trong Backend

**File:** `backend/tests/business-matrix-nine-process-four-shifts.test.js`

- Dựng 36 report từ `backend/tests/fixtures/process-form-test-data.json` nhưng **lấy process_id chuẩn ở `PROCESS_IDS`** của service live; ngày lấy theo lịch VN, không dùng ngày quá khứ đã hết hiệu lực.
- Với **mỗi** công đoạn/ca gọi `validateProductionReport`, sau đó tính `calculateProductionMetrics`; kiểm định TT OK=96, TT NG=2, thực tế=98, thực tế 7.5h, trừ 0.5h, KQD là NG và tỷ lệ NG bằng 2/98.
- Các ca phản ví dụ trên từng tổ hợp: TT NG sai tổng lỗi, thời gian trừ không khớp chi tiết, và thời gian vượt 12h đều phải bị chặn.
- Với **mỗi** tổ hợp kiểm tra admin, manager, lead, worker qua `assertActorProcessAccess` với DB executor giả lập danh sách phân quyền đúng actor. Đảm bảo quyền không được vượt phạm vi; worker không đọc được worker khác.
- Kiểm tra máy chung GC: 4 worker cùng liên kết event 8h chỉ tạo đúng 8h thời gian vật lý; thiếu event không lấy giờ cá nhân để bù.
- Kiểm tra cùng máy/sản phẩm ở Mài, split theo máy và `childRequestId` ổn định/không đụng ID giữa sản phẩm.
- Test backend có unit case khác về historical standard, immutable training snapshot, approval CAS, GC machine event, chống trùng và Excel parity được giữ trong CI.

**Lưu ý:** đây là matrix của **validator/KPI và phân quyền service**, KHÔNG khẳng định 36 trường hợp đã thành công khi submit báo cáo qua HTTP.

### B. HTTP/TiDB thật cho pending/khóa phạm vi/reject

**File:** `backend/tests/integration/business-process-scope.http.test.js`

- Test dựng lại DB có tên bắt buộc `ktc_it_*` từ canonical fixture + migrations; không nhận connection production, process tạo test tự cách ly, test runner thực thi nối tiếp.
- Seed **36 pending report** (mỗi tổ hợp công đoạn/ca 1 row) trực tiếp vào TiDB thử để test **quyền và trạng thái**, không giả mạo là 36 lần submit qua form.
- GET `/api/production-temp/pending` bằng **9 tài khoản manager**; mỗi manager chỉ thấy 4 ca ở đúng công đoạn của mình. Lead XLBV chỉ thấy XLBV; admin xem được pending; worker bị từ chối truy cập queue xét duyệt.
- Mỗi manager thử duyệt báo cáo ngoài phạm vi: HTTP 403/409 và đảm bảo status vẫn pending, **không tạo production_reports**.
- Dùng API `/api/production-temp/reject-selected` cho **36 tổ hợp đúng phạm vi**. Mỗi yêu cầu từ chối chuyển đúng trạng thái `rejected`, lưu lý do và reviewed_by; không tạo approved row; replay không ghi đè lý do.
- **Bằng chứng thực tế:** log run [44697820373](https://github.com/Nan1233/worker-management-system/actions/runs/44697820373) hiển thị `business-process-scope.http.test.js`: **40 tests / 40 pass / 0 fail**; toàn runner có **9 integration files, 0 failed**.

## 3. Kiểm thử chạy PASS

| Nguồn | Run | Bằng chứng |
|---|---|---|
| Test logic theo 9×4 + hồi quy toàn hệ thống | [44697040864](https://github.com/Nan1233/worker-management-system/actions/runs/44697040864) | **6/6 SUCCESS**, frontend lint/typecheck/build, backend business matrix và các test nghiệp vụ cũ, browser, Desktop Excel, Windows |
| Nghiệm thu sau bổ sung ma trận logic | [44697040898](https://github.com/Nan1233/worker-management-system/actions/runs/44697040898) | **3/3 SUCCESS**, E2E 22/22 |
| Test HTTP TiDB 36 pending/9 manager và chặn ngoài quyền | [44697541194](https://github.com/Nan1233/worker-management-system/actions/runs/44697541194) | **3/3 SUCCESS**, test tích hợp chạy thật |
| HTTP TiDB 36 reject/replay bổ sung | [44697820373](https://github.com/Nan1233/worker-management-system/actions/runs/44697820373) | **3/3 SUCCESS**, 40/40 HTTP test PASS ở riêng business-process-scope; E2E và Windows staging cùng PASS |

Không có deployment, không thay dữ liệu production và không chạy destructive migration ngoài database test.

## 4. Chênh lệch nghiệp vụ phát hiện — cần xác nhận

1. **P1 — Giới hạn số máy:** phần mô tả trong `backend/services/processMachinePolicy.js` nói **Đo tối đa 1, Ép 1 người/1 máy, Cán tối đa 4**, nhưng giá trị `getProcessMachinePolicy` hiện cho **DO=10, EP=10, CAN=10** machine lines trên một report. Test khóa **hành vi code đang chạy**, không tự sửa giới hạn; phải xác nhận chính sách trên xưởng và sự khác nhau giữa *số máy/người* với *số dòng máy/báo cáo*.
2. **P1 — Fixture lịch sử gắn process_id sai:** `process-form-test-data.json` mang K1=3 và K2=4, nhưng backend canonical id hiện là K1=4, K2=5. Ma trận mới dùng canonical `PROCESS_IDS`, tránh báo cáo kiểm thử nhầm công đoạn. Cần nâng cấp/loại fixture cũ sau khi đối chiếu dùng ở đâu.
3. **P2 — SX3 machine_no:** fixture có `LINE-SX3`, còn policy là `MANUAL_ONLY`; cần phân biệt mã dây chuyền và mã máy sản xuất trước khi kết luận lỗi.
4. KQD/NG trừ giờ không đủ khẳng định toàn bộ master data, lỗi NG động, quy tắc máy chia sẻ và định mức theo từng ngày đã đúng trên tất cả 9 công đoạn; hiện chỉ một số tổ hợp sâu đã qua integration độc lập.

## 5. Phần còn lại trước khi đóng hạng mục 2/12

- **Nhóm 2A (chưa nghiệm thu):** 9×4 submit **qua HTTP bằng đúng master data theo công đoạn**, không seed SQL; bao gồm EP/DO/CAN machine lines, K1/K2, SX3, NG và trừ giờ đúng loại.
- **Nhóm 2B (chưa nghiệm thu):** duyệt, sửa, từ chối, rollback, concurrent CAS, historical standard effective date và snapshot cho **tất cả công đoạn**, đặc biệt GC shared event và sản lượng vật lý.
- **Nhóm 2C (chưa nghiệm thu):** Excel→DB roundtrip theo 9 mẫu thực tế, ca ngày/đêm, dữ liệu đồng bộ xung đột, thiếu mạng/gửi lại; test với file dữ liệu staging được phép.
- **Nhóm 2D (chưa nghiệm thu):** nâng độ bao phủ E2E UI đối với form mỗi công đoạn, manager/lead RBAC nhiều công đoạn, trường động và mobile/offline; hiện E2E 22 luồng trọng yếu.
- Sau các nhóm trên cần chạy lại một cổng release tổng và so sánh từng quy tắc với nghiệp vụ xưởng, không tự đổi chính sách chỉ để test PASS.

**Trạng thái hạng mục 2/12:** **Đợt 1 hoàn thành và PASS trong phạm vi nêu trên; hạng mục toàn diện chưa đóng.** Production tiếp tục **NO-GO** cho đến khi đủ các mục release gate khác (PC UAT, Excel–DB staging, backup/restore, bảo mật, ký số).

**Giới hạn:** test matrix sử dụng dữ liệu sinh ra và data seed; chưa dùng dữ liệu sản xuất thật, không được diễn giải thành xác nhận số liệu lịch sử.
