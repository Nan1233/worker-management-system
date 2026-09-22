# KTC Test Center (test only)

Test Center chạy **một lần bấm** hai lớp kiểm tra:

- API smoke/business boundary: frontend reachability + các API quan trọng không được trả 5xx.
- Playwright E2E smoke: Chromium desktop + mobile, login page và browser console.

## Chạy local

```bash
cd tools/test-center
npm install
npx playwright install chromium
npm start
```

Mở `http://127.0.0.1:4790` và bấm **Chạy toàn bộ**.

Mặc định tool chỉ chấp nhận URL có `test`, `staging`, `localhost` hoặc `127.0.0.1`. Production bị chặn.

## Credential

Không đưa tài khoản/mật khẩu vào Git. Khi bổ sung E2E có đăng nhập, truyền credential test bằng environment variables.

## Cleanup

Nút **Dọn dữ liệu test** hiện đang fail-closed. Chưa cấu hình DB adapter nên không chạy DELETE. Chỉ bật sau khi xác định chính xác FK/table của môi trường test và có guard chống production.
