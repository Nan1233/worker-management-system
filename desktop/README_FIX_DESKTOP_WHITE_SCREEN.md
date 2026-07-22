# Sửa desktop trắng

Nguyên nhân: frontend Electron dùng BrowserRouter và asset Vite dạng đường dẫn tuyệt đối. Khi Electron mở `file://.../index.html`, JS/CSS và route không tải đúng.

Đã sửa:
- `BrowserRouter` -> `HashRouter`.
- Vite `base: './'`.
- Chỉ đăng ký service worker khi chạy qua HTTP/HTTPS, không đăng ký trên `file://`.
- Xóa thư mục lồng `frontend/frontend` để tránh build nhầm bản cũ.
