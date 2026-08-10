# KTC UI + Electron Hardening — 2026-08-10

## Mục tiêu
Không đổi nghiệp vụ. Nâng độ hoàn thiện UI và khả năng chạy desktop đa nền tảng.

## UI/UX
- Thêm `frontend/src/styles/pilot-ui-polish.css` sau release/responsive safeguards.
- Chuẩn hoá typography, card hierarchy, table density/sticky header, focus state, form alignment.
- Audit log có cảm giác timeline rõ hơn nhưng không đổi interaction.
- Monitoring, empty/loading state và offline card có tương phản/spacing ổn định hơn.
- Mobile giảm mật độ hợp lý, giữ input >= 16px và touch targets hiện có.
- Bump service-worker cache namespace để deploy không giữ CSS cũ.

## Electron/Desktop
- Bỏ hard-code `AppData/Local` trên mọi OS.
- Windows: `~/AppData/Local/KTC-Worker-Management`.
- macOS: `~/Library/Application Support/KTC-Worker-Management`.
- Linux: `~/.config/KTC-Worker-Management`.
- Thêm preflight kiểm quyền ghi data folder + Excel export folder trước build.
- Thêm field-readiness source checks và platform path contract tests.
- Giảm min window từ 1024x680 xuống 900x620 để chạy ổn hơn trên laptop nhỏ.
- Thêm `npm run build:mac` / `desktop dist:mac` cho DMG + ZIP universal unsigned phục vụ demo nội bộ trên Mac.

## Kiểm tra đã chạy
- Backend tests: 121/121 PASS.
- Frontend source tests: 30/30 PASS.
- Backend source syntax: 119 files PASS.
- Desktop check: PASS.
- Excel <-> DB source contract: PASS.
- Platform paths: PASS (win32/darwin/linux contract).
- Desktop preflight: PASS trong sandbox Linux.

## Build còn phải chạy trên máy thật
ZIP nguồn không kèm đầy đủ node_modules nên sandbox không thể hoàn tất `tsc/vite` (`vite/client`, `@types/node` thiếu). Chạy `npm run install:all` trước verify/build trên máy dự án.

## Lệnh Windows
```cmd
npm run install:all
npm run desktop:preflight
npm run verify
npm run build:exe
```

## Lệnh macOS
```bash
npm run install:all
npm run desktop:preflight
npm run verify
npm run build:mac
```

Bản macOS hiện là unsigned build cho demo nội bộ. Khi phát hành rộng cần Apple Developer signing/notarization.
