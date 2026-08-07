# KTC auth cross-tab final fix

## Root cause
`authGeneration` was stored only in JavaScript memory. Another browser tab, installed PWA window, or old Electron renderer could finish an old refresh request and write the previous account back into shared `localStorage`.

## Fix
- Persist `ktcAuthEpoch` in `localStorage`.
- Increment the epoch whenever login/logout/account switching starts.
- Reject login and refresh responses when their epoch is stale.
- Add per-login `ktcAuthSessionId`.
- Listen to the browser `storage` event and abort stale refresh requests in every open tab.
- Rotate the service-worker cache name to force the new authentication bundle to replace older cached bundles.

## Expected behavior
- Login 599, then login aaa: aaa remains active.
- A failed login stays on the login page with no previous account restored.
- An old tab/PWA cannot restore its previous token after another tab switches account.
