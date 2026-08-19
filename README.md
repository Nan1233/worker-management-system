# KTC Worker Management System

Hệ thống quản lý sản xuất và báo cáo công nhân của KTC (HANOI) CO., LTD.

## Cấu trúc

- `frontend/` — React + TypeScript + Vite
- `backend/` — Node.js + Express + MySQL/TiDB
- `desktop/` — Electron app cho đồng bộ/xử lý Excel
- `shared/` — logic dùng chung
- `scripts/` — kiểm tra build/release
- `tests/` — test cấp dự án

## Chạy frontend

```bat
cd frontend
npm install
npm run dev
```

## Chạy backend

```bat
cd backend
npm install
npm start
```

## Build frontend

```bat
cd frontend
npm run build
```

Giao diện dùng CSS cơ bản, tập trung vào khả năng bảo trì và tương thích mobile/desktop.
