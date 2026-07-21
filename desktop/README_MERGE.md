# KTC Desktop 1.0.5

Bản ghép đúng yêu cầu:
- Toàn bộ frontend là frontend mới hiện tại.
- Chỉ lấy logic Excel/IPC của bản Desktop chạy tốt.
- Frontend được build cục bộ vào EXE, không dùng frontend cũ và không phụ thuộc giao diện Render khi chạy.

## Chạy thử
```bat
npm install
npm --prefix frontend install
npm start
```

## Đóng gói
```bat
npm run dist:win
```
