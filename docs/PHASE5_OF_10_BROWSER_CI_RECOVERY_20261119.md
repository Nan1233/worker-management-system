# KTC — Giai đoạn 5/10: Chromium browser CI recovery and login guard

Date: 2026-11-19. Branch `refactor/ktc-local-cleanup`. No merge/deploy/DB writes.

## Verified root cause of Phase 3 and 4 CI failure

GitHub Actions [run 44517341120](https://github.com/Nan1233/worker-management-system/actions/runs/44517341120) has four passing jobs (Backend, Frontend, Linux Desktop and Windows Desktop), but Browser fails 2/6 tests. Logs prove the app login input has `maxlength=20`, while the Playwright test typed a 23-character synthetic code and incorrectly expected the entire value. Both desktop and mobile Chromium received the expected first 20 characters; this is **an incorrect test assertion, not evidence that login truncation is broken**. Browser route guard and mobile overflow tests passed 4/4.

## Code and tests delivered

- `frontend/tests/e2e/phase3-public-security.spec.ts`: keyboard-input test now asserts `maxlength=20` and the correctly truncated synthetic value, on both desktop and mobile.
- Adds a browser security smoke that sets a synthetic invalid local token and verifies protected Manager Reports cannot be opened without a valid authenticated session. This does not impersonate a real user and does not contact production.
- Existing Windows XLSX and backend/frontend regression jobs remain unchanged.

## Evidence still required

The latest [Phase 5 GitHub Actions run](https://github.com/Nan1233/worker-management-system/actions?query=branch%3Arefactor%2Fktc-local-cleanup) must reach **completed/success** before any PASS claim. The previous Phase 4 run failed on the incorrect test assertion. No fabricated success.

D-04/D-05/D-09/D-17 remain PARTIAL until authenticated browser flows are verified with disposable API/DB fixtures. D-11/D-13/D-14/D-15/D-16 remain PARTIAL pending isolated TiDB. D-18/D-19 remain PARTIAL for installer and complete Excel import/CAS; D-07 remains OPEN for sign-off. Overall ledger remains 8 PASS, 11 PARTIAL, 1 OPEN. Production release **NOT APPROVED**.
