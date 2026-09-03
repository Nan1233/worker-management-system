# Mài – cập nhật dữ liệu 2026-09-03

Nguồn dữ liệu: bảng Mài người dùng cung cấp ngày 2026-09-03.

Quy tắc dữ liệu:
- Tổng thời gian mài là tổng thời gian thực tế của tất cả các lần/khoảng mài cho 1 sản phẩm.
- Năng suất/giờ được suy ra tự động: `3600 / tổng_thời_gian_mài_giây`.
- Không lưu/copy giá trị `#DIV/0!`; nếu thiếu tổng thời gian thì phải bổ sung từ các lần mài có trong bảng.
- Nếu thời gian là khoảng (ví dụ 12–13s), dùng giá trị tổng thời gian đã thể hiện trong bảng nếu có; không tự thay thế bằng giá trị khác.
- Chỉ áp dụng cho công đoạn Mài.

Các giá trị suy ra chắc chắn từ bảng:
- QC5-1657-000 / QC5-1657 / máy 21-22: tổng 570s -> 6.315789 SP/h (~6.32).
- QC5-1657-000 / QC5-1657 / máy 29-30: 40s + 40s = 80s -> 45 SP/h.
- QC6-6773 / QC6-6773 / máy 21-22: 240s -> 15 SP/h.
- QC4-7630-000 / QC4-7630 / máy 19-23-24: 46s -> 78.26087 SP/h (~78.3).
- QC3-2556-000 / QC3-2556 / máy 3-5: 14s -> 257.142857 SP/h.
- QC4-7133-000 / QC4-7133 / máy 1-2-3-4-5-6-8-9-10-11: 13s -> 276.923077 SP/h.
- QC4-6262-000 / QC4-6262 / máy 12: 12s -> 300 SP/h.
- QC8-9503 / QC8-9503 / máy 19-27-28-29-30: 20s + 20s = 40s -> 90 SP/h.
- Fl4-5091 / Fl4-5091 / máy 19-23-24-25-26-27-28-29-30: 45s -> 80 SP/h.
- MA3-0575 / MA3-0575 / máy 19-27-28-29-30: 10-12s + 20-22s; bảng ghi tổng 34s -> 105.882353 SP/h.
- 6A3-0977 / 6A3-0977 / máy 19-27-28-29-30: 40s -> 90 SP/h.
- QC5-9565-000 / QC5-9565 / máy 19-27-28-29-31: 14-15s + 14-15s; bảng ghi tổng 30s -> 120 SP/h.
- QC8-1467-000 / QC8-1467 / máy 29-30: 44+29+44+29+44+29 = 219s -> 16.438356 SP/h.
- QC8-1470-000 / QC8-1470 / máy 29-30: 44+29+44+29 = 146s -> 24.657534 SP/h. Thay cho #DIV/0!.
- QC5-3438-000 / QC5-3438 / máy 19,23-24: 10s -> 360 SP/h.
- QC2-9149-000 / QC2-9149 / máy 8: bảng ghi 10s -> 360 SP/h.
- QC5-1080-000 / QC5-1080 / máy 4: 15s -> 240 SP/h.
- QC4-8484-000 / QC4-8484 / máy 13-14,17-18,21-22: 26s -> 138.461538 SP/h.
- QC4-8485-000 / QC4-8485 / máy 29: 29s -> 124.137931 SP/h.
- QC4-2821-000 / QC4-2821 / máy 26: 26s -> 138.461538 SP/h.
- QC4-2822-000 / QC4-2822 / máy 29: 29s -> 124.137931 SP/h.
- QC5-1090-000 / QC5-1090 / máy 28: 28s -> 128.571429 SP/h.
- QC6-8234-000 / QC6-8234 / máy 26: 26s -> 138.461538 SP/h.
- QC6-8235-000 / QC6-8235 / máy 26: 26s -> 138.461538 SP/h.
- 5243 / LF5243 / máy 13-14-15-16-17-18: 60s -> 60 SP/h.
- 15U / D0015U / máy 55: 55s -> 65.454545 SP/h.
- 123 / LEH123 / máy 25: 25s -> 144 SP/h.
- 9276 / LY9276 / máy 20-15-16-7-12-19: 10s -> 360 SP/h.
- DOO2SS / DOO2SS / máy 16: 16s -> 225 SP/h.
- P28596001, P27678011, P10255004 / máy 13-18 hoặc 51 theo bảng: tổng 51s -> 70.588235 SP/h.
- P45840001 / máy 55: tổng 55s -> 65.454545 SP/h.
- P57692402 / máy 52: tổng 52s -> 69.230769 SP/h.
- P57049906 / máy 51: tổng 51s -> 70.588235 SP/h.
- P58966900 / máy 55: tổng 55s -> 65.454545 SP/h.
- P62830603 / máy 51: tổng 51s -> 70.588235 SP/h.
- P66869902 / máy 51: tổng 51s -> 70.588235 SP/h.
- P49746004 / máy 51: tổng 51s -> 70.588235 SP/h.
- P32679023 / máy 51: tổng 51s -> 70.588235 SP/h.
- 30375120 / máy 51: tổng 51s -> 70.588235 SP/h.
- QC7-6485 / máy 27-28-29-30: 20s -> 180 SP/h.
- QC7-6486, QC7-6487, QC7-6491, QC7-6492, QC7-6493, QC7-6494, QC7-6495 / máy 20: bảng ghi 20s -> 180 SP/h.
- QC7-6488, QC7-6489 / máy 28: 28s -> 128.571429 SP/h.
- QC7-6490 / máy 20: 20s -> 180 SP/h.
- 625542421 / máy 14-17: 22s -> 163.636364 SP/h.
- 625542431 / máy 18: 18s -> 200 SP/h.
- 625543311 / máy 18: 18s -> 200 SP/h; máy 19-27-28-29-30: 22s -> 163.636364 SP/h.
- QC8-6328 / máy 19-27-28-29-30: 80s -> 45 SP/h.

Lưu ý: một số dòng trong nguồn có ô bị lệch/merge, nên tài liệu này không tự bịa lại các trường chưa xác định chắc chắn. Các mã như 125, 16M, 16D, PK, 16H, 6E xuất hiện theo nhóm kế thừa của dòng trước; cần giữ theo cấu trúc nguồn khi nạp dữ liệu, không tự gán máy mới nếu không có căn cứ.
