# Sửa nhận diện IP thật trên Render

- Bật `app.set("trust proxy", true)` vì Render có thể có nhiều lớp reverse proxy.
- Đọc `CF-Connecting-IP`, `True-Client-IP`, sau đó chuỗi `X-Forwarded-For`.
- Chọn IP public đầu tiên và loại các IP proxy/private như `10.x`, `192.168.x`, `172.16-31.x`.
- IP KTC được phép: `113.160.133.126`.
- Worker ngoài IP này bị chặn HTTP 403 khi tạo/sửa báo cáo.
- API `/api/network/access` trả đúng IP public cho frontend.
