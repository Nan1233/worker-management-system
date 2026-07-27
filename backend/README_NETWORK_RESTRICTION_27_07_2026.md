# Giới hạn nhập báo cáo theo mạng công ty

Đã sửa frontend(50) và backend(52):
- Worker mở form sẽ gọi GET /api/network/access.
- Không đúng mạng công ty: không hiển thị form, có nút Kiểm tra lại.
- Backend chặn POST /api/production-temp, POST /api/production-temp/check-similar và PUT /api/production-temp/:id đối với worker.
- Admin/manager không bị chặn bởi middleware này.
- Backend hỗ trợ IP đơn hoặc CIDR.

## Cấu hình Render backend
1. Kết nối Wi-Fi công ty và xác định IP Internet công cộng.
2. Thêm Environment Variables:

COMPANY_NETWORK_ENFORCED=true
COMPANY_ALLOWED_IPS=113.160.133.126

Nhiều IP:
COMPANY_ALLOWED_IPS=113.xxx.xxx.xxx,14.xxx.xxx.xxx

Dải CIDR:
COMPANY_ALLOWED_IPS=113.xxx.xxx.0/24

Lưu ý: phải cấu hình IP công cộng, không dùng IP nội bộ 192.168.x.x. Nếu chưa cấu hình xong, giữ COMPANY_NETWORK_ENFORCED=false để tránh khóa toàn bộ công nhân.


## Cấu hình đã gắn trong bản này

```env
COMPANY_NETWORK_ENFORCED=true
COMPANY_ALLOWED_IPS=113.160.133.126
```

Worker chỉ được mở/lưu form khi request đi qua IP công cộng trên.
