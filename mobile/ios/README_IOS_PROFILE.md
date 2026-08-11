# KTC iOS Web Clip (.mobileconfig)

File: `KTC-Production-Control.mobileconfig`

Profile này cài Web Clip KTC Production Control lên Home Screen và mở:

`https://worker-management-system-3-dzox.onrender.com/#/login`

Không phải file IPA và không biến website thành ứng dụng native iOS. Đây là configuration profile Web Clip dành cho truy cập nội bộ nhanh.

Sau khi frontend được deploy, có thể mở trên Safari:

`https://worker-management-system-3-dzox.onrender.com/KTC-Production-Control.mobileconfig`

Sau khi tải profile, iOS yêu cầu người dùng vào Settings để xem/cài profile.

Profile được để `IsRemovable=true` để người dùng có thể gỡ. Nếu KTC triển khai MDM/supervised devices sau này có thể đổi policy.
