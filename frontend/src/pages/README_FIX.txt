KTC LOGIN FINAL FIX - 2026-08-17

Replace:
frontend/src/pages/Login.tsx
frontend/src/pages/Login.css

Fixes:
- Login.css syntax error caused by missing closing brace before .login-form.
- Prevents login layout/input/status/remembered-account overflow.
- Mobile widths <= 360px are handled.
- System status dot stays immediately before the text and vertically centered.
- Worker login code is normalized for numeric codes with leading zeros (e.g. 0599 -> 599).
- Login response accepts both {user} and {data:{user}} shapes.
- Loading/error states are deterministic.
- No Times New Roman.
