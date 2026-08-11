# Excel Vietnamese operation labels - 2026-08-11

- Sheet báo cáo chính không còn hiển thị enum nội bộ CUT/NEST/MANUAL/MACHINE.
- Hiển thị người dùng: CẮT/LỒNG/TAY/MÁY.
- Enum backend/DB giữ nguyên để không phá contract.
- Excel -> DB parser đã hỗ trợ map ngược tiếng Việt về enum nội bộ.
- Sheet TAY MÁY CẮT LỒNG tiếp tục dùng tiếng Việt.

Kiểm tra:
- node --check desktop/electron/monthlyWorkbookLocal.cjs: PASS
- node desktop/scripts/checkExcelDbSync.cjs: PASS
