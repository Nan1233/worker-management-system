# KTC — Phase 2 Part 8/10: Admin, Master Control, permission cache and scoped CSS

Date: 2026-11-19  
Repository: `Nan1233/worker-management-system`; branch `refactor/ktc-local-cleanup`

## Audit findings

- `backend/routes/adminControlRoutes.js` uses `auth`, role('admin'), and additionally requires a database-backed `is_super_admin === true` before Master Control operations. Granular permissions apply to individual endpoints. This backend authorization was **not changed**.
- `frontend/src/pages/admin/Permissions.tsx` updates role/user overrides and calls `clearPermissionClientCache()` after a successful write.
- `frontend/src/security/permissions.ts` previously cleared only the completed `cache`, not a currently in-flight `/permissions/me` request. As a result, a stale response could repopulate the cache after a permission update; a new request might also reuse the old in-flight response.
- `frontend/src/pages/admin/Permissions.css` had two bare `.module-row td` selectors that applied globally because the stylesheet is imported by `frontend/src/App.tsx`; both could style unrelated tables if they reused that class.

## Implemented source changes

1. `frontend/src/security/permissions.ts`: introduced `permissionCacheGeneration`; `clearPermissionClientCache` increments generation, clears cached data **and** `inFlight`. Requests capture their generation; outdated responses fail closed with an empty permissions set and cannot repopulate cache. Existing same-user in-flight deduplication and network-failure fail-closed behavior remain.
2. `frontend/src/pages/admin/Permissions.css`: scoped both group-row selectors to `.permission-page .module-row td` without changing their declarations.
3. `frontend/tests/permission-cache-invalidation-race.test.cjs`: added six Node tests covering an outdated response after invalidation, in-flight request deduplication, failure/retry, admin permission cache clearing and server-side Master Control guard contracts, PermissionRoute fail-closed behavior, and CSS selector scope.

## GitHub commits

- `8079458695b1d10b2e1998922e60fc8e2fa265f4` — stale permission response protection
- `f3380649fd1f2759cd862f35b9ec54a9ab769110` — regression tests
- `92bc3b8a5466351a3894150af568517e8805c2c2` — CSS selector scope
- `5d84e42283dde7b02d25718d049d4df9b68f9d91` — CSS test

## Verification and limits

Re-read resulting GitHub files and checked 12 independent static invariants: **12/12 met**. This proves source consistency only.

**Not run:** the Node test file, TypeScript typecheck, full frontend lint/build, actual Admin/Master Control role interactions, responsive visual testing, or real permission API integration. The current execution container lacks an isolated checkout/dependency set; direct GitHub checkout was previously blocked. Do not call the static checks a CI PASS or production release.

Focused commands once a safe checkout is available:

```bash
cd frontend
node --test tests/permission-cache-invalidation-race.test.cjs
npm run typecheck
npm run lint
```

Then verify on isolated fixture environment:
- Admin role/user permission overrides update and refresh visible capabilities; revoke a permission during an in-flight request and verify stale response cannot restore it
- Manager/lead/worker denied Master Control; regular admin without super-admin flag denied; only authorized super-admin sessions access it
- Permission page dark/light and mobile/desktop layouts, and other pages' tables are unaffected

## Deferred items

Retain **D-01 through D-15**, added **D-16** for cache/race/permission regression and **D-17** for CSS/UI/browser verification. The persistent list is `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md`; repeat unresolved items in every future status response. Run a consolidated evidence-based verification near Part 10 and skip only previously proven PASS results on unchanged code.

## Acceptance

Part 8 **source refactor completed and source-verified**, runtime acceptance remains **pending**. No schema/data changes, database writes, merge or deployment.
