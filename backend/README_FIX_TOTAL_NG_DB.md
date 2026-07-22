# Fix Tổng NG theo dữ liệu chi tiết trong DB

- Excel và Google Sheet không còn dùng production_reports.tt_ng làm nguồn Tổng NG.
- Tổng NG = SUM(quantity) của toàn bộ production_report_defects thuộc report.
- TT = OK + Tổng NG để các cột đầu ra luôn nhất quán.
- Danh sách cột lỗi là hợp của danh mục active và các loại lỗi thực tế đã được báo cáo sử dụng.
- Lỗi đã inactive nhưng còn dữ liệu lịch sử vẫn có cột, tránh Tổng NG khác tổng các cột chi tiết.
