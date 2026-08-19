# KTC Demo Yellow-Gate Hardening — 2026-08-19

## Performance
- Approval audit events are batched into one INSERT per approved report instead of three sequential round trips.
- Dashboard already uses bounded TTL cache + parallel aggregate queries.
- Notification unread-count already uses a bounded per-user TTL cache.
- Runtime metrics expose route P50/P95/max so production latency can be measured rather than guessed.

## Android
- Added `npm run device:android:check` to fail closed unless ADB sees a real device.

## Windows EXE
- Added `npm run device:smoke` to verify a real Windows release artifact exists before manual install/run testing.

## iOS
- Added `npm run device:ios:check` to fail closed unless executed on macOS with Xcode device inventory.

Physical-device gates are intentionally not fabricated as PASS by source tests.
