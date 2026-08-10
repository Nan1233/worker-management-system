# KTC P1.2 - Worker / Process / Master-data cache hardening

Date: 2026-08-10

## Changes

- Session cache is namespaced by authenticated identity and auth session id.
- In-flight responses from an old identity cannot write into the new identity cache namespace.
- `/workers/me` data is rejected when `user_id` or `worker_code` does not match the authenticated worker.
- Worker profile cache keys include user id, worker id, and worker code.
- Master-data cache uses a browser-wide `ktcMasterDataEpoch` revision so edits stop addressing stale cache keys across tabs.
- Admin/master changes invalidate master-data cache after successful mutation.
- User/process-assignment changes invalidate worker-profile and permission client caches.
- Training-percent updates invalidate the current worker cache when relevant.

## Verification

- frontend tests: 19/19 PASS
- backend tests: 106/106 PASS
- backend source check: PASS
- desktop source check: PASS
- Excel <-> DB source contract: PASS
- frontend typecheck in sandbox: blocked only because the source ZIP does not include `vite/client` and `@types/node` dependencies.

## Changed files

- frontend/src/services/sessionCache.ts
- frontend/src/utils/authStorage.ts
- frontend/src/services/masterDataCache.ts
- frontend/src/services/workerService.ts
- frontend/src/pages/admin/MasterData.tsx
- frontend/tests/cache-identity-hardening.test.cjs
