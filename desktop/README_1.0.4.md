# KTC Desktop 1.0.4

Bản kết hợp đúng yêu cầu:

- Giao diện: dùng frontend hiện tại tại Render, không dùng frontend cũ đóng gói trong EXE.
- Excel: dùng nguyên logic của bản `KTC-Desktop-Full-DB-Fixed(2)` đã chạy ổn định.
- Phiên bản nâng lên 1.0.4 để tránh nhầm với EXE cũ.

## Build

```bat
cd /D C:\Users\quant\Documents\VSCode\App\desktop
npm install
npm run dist:win
```

## Chạy thử trước khi đóng gói

```bat
npm start
```

## Log

Log nằm tại:

```text
%LOCALAPPDATA%\KTC-Worker-Management\UserData\logs\desktop.log
```

## Lưu ý

Bản này không chứa frontend cũ. Cửa sổ Electron mở trực tiếp frontend hiện tại:

```text
https://worker-management-system-3-dzox.onrender.com
```
