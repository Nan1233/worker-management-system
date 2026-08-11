# KTC iPhone Web Clip (.mobileconfig) — Icon Fixed

Bản này sửa lỗi icon Web Clip bị xám bằng cách **nhúng trực tiếp icon PNG 400×400, opaque vào payload `Icon`**. Không còn phụ thuộc `IconURL` hoặc favicon từ website.

## File cần deploy
- `frontend/public/KTC-Production-Control.mobileconfig`

Vite sẽ copy file này vào `dist` khi build.

## Render
`frontend/render.yaml` của project cần trả path `/KTC-Production-Control.mobileconfig` với `Content-Type: application/x-apple-aspen-config` và không cache.

## Cài lại trên iPhone
1. Gỡ profile/Web Clip KTC cũ trước để tránh icon bị cache.
2. Deploy frontend mới.
3. Mở Safari trên iPhone: `https://worker-management-system-3-dzox.onrender.com/KTC-Production-Control.mobileconfig`
4. Settings > Profile Downloaded > KTC Production Control > Install.
5. Quay lại Home Screen và kiểm tra icon KTC.

## Ghi chú
- `KTC-WebClip-Icon-400.png` chỉ để kiểm tra hình ảnh; profile đã nhúng icon trực tiếp.
- `IsRemovable=true` phù hợp demo/pilot.
- `FullScreen=true` để Web Clip mở như web app.
