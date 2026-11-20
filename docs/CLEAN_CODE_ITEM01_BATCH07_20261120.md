# KTC — Clean code hạng mục 1/12 · Đợt 7: Electron startup, IPC và log bảo mật

**Ngày:** 20/11/2026  
**Nhánh:** `refactor/ktc-local-cleanup`  
**Runtime SHA:** `70e8e961ac6cea01abdd1fe57cf25aaa8351e525`  
**CI test coverage SHA:** `d44fc6dc0cd46674c088e96d66205607b2d7dc82`

## Đã thay đổi

### 1. Khóa rủi ro ghi token/đường dẫn nhạy cảm vào log Desktop

- `desktop/electron/desktopLog.cjs`: thêm `redactSensitiveText` cho nội dung text không có key, bao gồm thông báo từ renderer, stack và lỗi từ backend.
- Che các mẫu `Bearer`, Authorization, `access_token`, `refresh_token`, `password`, `cookie`, `secret`, API key; bỏ query/hash khỏi URL trong log; thay đường dẫn Windows dưới user profile và `/home`, `/Users` bằng marker.
- Bổ sung che chuỗi trước khi ghi log dạng string cấp cao nhất (trước đây string được đưa thẳng vào log).
- `desktop/electron/launcher.cjs`: `writeLauncherLog` dùng `sanitizeLogDetails(payload)` thay vì ghi raw payload; `safeCrashSummary` dùng cùng cơ chế. Không dump biến môi trường, token hoặc toàn bộ Error.
- **Giới hạn:** sanitizer theo mẫu không thể bảo đảm che mọi cấu trúc bí mật chưa biết. Vẫn cần review nguồn log, chỉ ghi metadata cần thiết; không nên gửi log cho bên thứ ba nếu chưa rà soát.

### 2. Rút gọn và giữ whitelist IPC preload

- `desktop/electron/preload.cjs`: tách `subscribeDesktopEvent(channel, callback)` để quản lý `ipcRenderer.on` và `removeListener`.
- Ba API công khai vẫn giữ nguyên: `onSyncResult`, `onExcelDbSyncResult`, `onSyncError`; chỉ gọi các kênh cố định đã whitelist, từ chối callback không phải function.
- Không lộ đối tượng `ipcRenderer`, không tạo API nhận tên channel từ frontend, không thay các method preview/apply/saveExcel hoặc chữ ký IPC.
- `main.cjs` tiếp tục có `sandbox: true`, `nodeIntegration: false`, `contextIsolation: true`, chính sách trusted renderer URL, preview guard, import file size và giới hạn retry cho mutation. Không sửa các phương thức IPC chính hay các transaction trong đợt này.

### 3. Bảo toàn startup và cấu hình triển khai

- Không đổi thứ tự các Excel runtime patches v5/compact/report-date/v6 trước `main.cjs`.
- Không đổi thời điểm preload, trình nạp frontend, first paint, portable updater và đường dẫn dữ liệu/thư mục NAS.
- `deploymentProfile.cjs` tiếp tục tách TEST và production; giá trị không nằm trong hai profile bị từ chối.
- Hành vi đọc token từ sessionStorage trước localStorage, giải mã và hết hạn token giữ nguyên; không thay vòng đời phiên đăng nhập.

## Bài kiểm thử và CI

Thêm `desktop/tests/electron-startup-ipc-privacy.test.cjs` (**4 test**), gồm:
- Che token trong chuỗi lỗi, query URL, đường dẫn user, payload có object lồng;
- Giữ crash monitor và trình tự tải Excel patches ở launcher;
- Giả lập preload thực tế bằng VM để kiểm tra 3 subscription (đăng ký, nhận event, hủy, callback sai), chỉ lộ whitelist;
- Kiểm tra các flags an toàn của Electron và giới hạn điều hướng.

Đưa vào 2 workflow các test sẵn có `desktop-log-privacy.test.cjs`, `startup-crash-diagnostics.test.cjs`, `startup-performance.test.cjs`, `deep-security-boundary.test.cjs`, `renderer-auth-token-source.test.cjs` và `deployment-profile.test.cjs`.

| Cổng | Run | Kết quả |
|---|---|---|
| Phase 2 consolidated isolated verification | [44694612067](https://github.com/Nan1233/worker-management-system/actions/runs/44694612067) | **6/6 SUCCESS**: lint/typecheck/build, Backend, browser smoke, Windows, Desktop/Excel và log/token/IPC regression |
| Three-part isolated acceptance | [44694612080](https://github.com/Nan1233/worker-management-system/actions/runs/44694612080) | **3/3 SUCCESS**: TiDB HTTP cô lập; E2E Chromium desktop/mobile **22/22 PASS, 0 flaky**; Windows NSIS + Portable staging |

Hai workflow chạy trên đúng cùng SHA `d44fc6dc0cd46674c088e96d66205607b2d7dc82` (workflow-only thay đổi so với runtime SHA, không thay business code).

## Ranh giới chưa nghiệm thu / còn phải rà soát

- **Đợt 7 đã PASS trong phạm vi ưu tiên, không có nghĩa toàn bộ IPC/main.cjs đã được audit bảo mật**. Cần tiếp tục kiểm soát `event.senderFrame` và từng IPC handler có quyền ghi file/chỉnh DB; đối soát nội dung token và cookie trong tất cả nguồn log.
- `main.cjs` ~67 KB, `launcher.cjs` ~17 KB; chưa phân rã toàn bộ để tránh thay đổi chuỗi runtime patches và khởi động Windows.
- CI chạy browser cô lập, Windows staging không ký số. Chưa chạy phần mềm trực tiếp trên PC KTC, chưa có đối soát Excel–TiDB với dữ liệu staging cho phép.
- Chưa merge main, không deploy Cloudflare, không cập nhật TiDB production.

**Trạng thái hạng mục 1/12:** **7/8 đợt dự kiến đạt CI**. Đợt 8 cần đánh giá toàn repo, đối chiếu mục tiêu clean, làm sạch phần code thừa có chứng cứ, chạy lại các cổng hồi quy, tạo backlog cho các module lớn chưa được tách; không đánh đồng 8/8 đợt với production-ready.
