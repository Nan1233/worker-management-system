KTC - SỬA SEED DB NHANH / KHÔNG BỊ TREO IM
Ngày: 10/08/2026

Lỗi đã sửa:
- Seed cũ chạy hàng nghìn INSERT tuần tự qua TiDB nên có thể rất chậm và không có log tiến độ.
- DB hiện tại có 8 công đoạn, trong khi snapshot chuẩn có 9.
- product_aliases, product_standard_variants, master_seed_runs đang rỗng vì seed chưa commit.

Bản sửa:
- Batch UPSERT mặc định 200 dòng/lần.
- In log từng giai đoạn bằng tiếng Việt.
- Tự tạo bảng hỗ trợ seed nếu thiếu.
- Tự bổ sung đủ 9 công đoạn.
- Chạy lại an toàn, không nhân đôi theo khóa UNIQUE.
- Không xóa báo cáo sản xuất cũ.

CHÉP ĐÈ TỐI THIỂU:
backend\scripts\runMasterSeed.js

Nên chép cả bộ backend trong ZIP để đồng bộ migration + snapshot + verifier.

CHẠY:
cd /d C:\VSCode\worker-management-system
node --check backend\scripts\runMasterSeed.js
npm --prefix backend run db:seed-master
npm --prefix backend run db:verify-master

Nếu muốn chạy cả migration sau khi seed đã sửa:
npm --prefix backend run db:migrate
npm --prefix backend run db:verify-master
