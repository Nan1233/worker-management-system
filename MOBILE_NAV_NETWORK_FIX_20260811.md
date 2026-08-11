# Mobile navigation + network gate fix — 2026-08-11

- Bottom worker navigation now contains only the four primary destinations. Logout remains in the top account action and profile flow, preventing the fifth item from wrapping outside the mobile navigation shell.
- Mobile navigation grid is hardened with `repeat(4,minmax(0,1fr))`, clipping, fixed-width buttons and responsive labels.
- Company network checks now always call `getCompanyNetworkAccess(true)` so the 5-minute session cache cannot keep a stale IP after switching Wi-Fi/4G.
- Network access automatically rechecks on `online`, window `focus`, and document `visibilitychange` when returning from iOS/Android Settings.
- Added regression source contracts for both fixes.
- Frontend version/cache namespace: 1.8.18.
