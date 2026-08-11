# KTC Any Network Build Fix - 2026-08-11

- Removed stale `checkCompanyNetwork()` call from `frontend/src/pages/worker/ProcessPage.tsx`.
- Removed `requireCompanyNetworkForWorker` middleware from worker production-temp create/check-similar/update routes.
- Workers can use any Internet connection (Wi-Fi/4G/5G).
- Existing offline queue remains active when `navigator.onLine` is false or transient network requests fail.
