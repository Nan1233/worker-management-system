# BỔ SUNG CHỨC NĂNG QUẢN LÝ - 23/07/2026

## Chức năng đã đưa ra menu quản lý
- Quản lý người dùng, vai trò và phân công công đoạn.
- Quản lý công đoạn.
- Quản lý máy sản xuất theo công đoạn.
- Quản lý sản phẩm và định mức theo công đoạn/loại công việc.
- Quản lý loại lỗi NG.
- Quản lý lý do trừ giờ.
- Thêm, sửa, khóa/mở lại dữ liệu.
- Tìm kiếm nhanh và hiển thị trạng thái dữ liệu.

## Phân quyền
- Admin: toàn bộ chức năng.
- Manager: người dùng cấp dưới và toàn bộ dữ liệu sản xuất.
- Lead: quản lý công nhân/người dùng cấp dưới; không sửa dữ liệu gốc nhà máy.

## Đường dẫn
- /admin/master/users, /manager/master/users
- /admin/master/processes, /manager/master/processes
- /admin/master/machines, /manager/master/machines
- /admin/master/standards, /manager/master/standards
- /admin/master/defects, /manager/master/defects
- /admin/master/deductions, /manager/master/deductions

Không cần chạy migration SQL mới vì các chức năng sử dụng các bảng hiện có: processes, machines, product_standards, defect_types, deduction_types, users.
