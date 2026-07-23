# KTC Production Control Desktop - Latest Web + Auto Excel

Bản Desktop này tải trực tiếp giao diện web mới nhất tại:

https://worker-management-system-3-dzox.onrender.com

Do đó giao diện và chức năng luôn khớp với frontend đang deploy, không đóng gói một bản frontend cũ bên trong EXE.

## Tự động Excel

Sau khi đăng nhập, frontend nhận biết môi trường Desktop qua `window.ktcDesktop` và gửi token cho Electron. Electron đồng bộ ngay và lặp lại mặc định mỗi 5 phút.

Thư mục mặc định:

`Documents\KTC\Bao cao san xuat\<năm>\<công đoạn>\<file tháng>.xlsx`

Có thể đổi:

- `KTC_APP_URL`: URL frontend
- `KTC_API_URL`: URL backend API
- `KTC_EXPORT_ROOT`: thư mục Excel
- `KTC_SYNC_INTERVAL_MS`: chu kỳ đồng bộ, tối thiểu 60000 ms

## Cài và build

```bat
npm install
npm run dist:win
```

File cài đặt và portable nằm trong `release`.
