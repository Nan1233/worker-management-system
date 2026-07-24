# Kiến trúc frontend

- `src/config`: cấu hình môi trường và menu.
- `src/services/api.ts`: Axios client duy nhất, tự gắn access token và refresh token.
- `src/services/*Service.ts`: API theo miền nghiệp vụ.
- `src/utils/authStorage.ts`: nơi duy nhất đọc/ghi phiên đăng nhập.
- `src/routes/AppRouter.tsx`: route lazy-loaded theo vai trò.
- `src/pages`: màn hình theo admin, lead, manager và worker.
- `src/components`: component dùng lại.

## Quy tắc bảo trì

1. Không tạo thêm Axios instance ngoài `src/services/api.ts`.
2. Không đọc trực tiếp khóa token từ `localStorage`; dùng `authStorage.ts`.
3. URL API chỉ cấu hình tại `src/config/env.ts` hoặc biến `VITE_API_URL`.
4. Màn hình mới phải lazy-load trong router.
5. Không commit `dist`, `node_modules`, file zip hoặc bản sao mã nguồn.
