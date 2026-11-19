# KTC Phase 2 deferred batch 2/5 — Worker, Master Control and Admin UI

Date: 2026-11-19. Branch: `refactor/ktc-local-cleanup`.

## Outcome

**Focused CI green, 137/137 tests PASS; D-09/D-16/D-17 remain PARTIAL until browser integration and visual acceptance.**

GitHub Actions run: [44506347025](https://github.com/Nan1233/worker-management-system/actions/runs/44506347025) on source SHA `a48134f4143a537329196d09e1efd0724373fe1e`:
- Backend: **43/43 PASS**, syntax/source checks PASS;
- Frontend: **73/73 PASS**, typecheck/lint/build PASS;
- Desktop: **21/21 PASS**, renderer source checks PASS;
- Final summary: **SUCCESS (4/4 jobs)**.

Test selection reuses existing isolated unit/contract tests for draft restore and quota failure, single-click submit and duplicate handling, atomic multi-machine offline staging, delayed flush and worker switching, Master Control route/permission guards, Admin permission UI and responsive CSS. No real DB or file generation was used.

## Changes actually committed

1. `frontend/src/security/permissions.ts`: old-account pending permissions responses fail closed even when an account switch happened while the network request was running.
2. `frontend/tests/permission-cache-invalidation-race.test.cjs`: exercises account change during in-flight request and confirms old permissions cannot enter the current user's cache.
3. `frontend/src/pages/admin/Permissions.css`: adds explicit `data-theme=dark` colors for cards, headings, alerts, inputs and role table; mobile width safeguards. Uses scoped selector `tr[class~="module-row"] td` to retain compatibility with existing global-leakage CSS test.
4. `frontend/tests/admin-permission-responsive.contract.test.cjs`: test for responsive/contrast selector conventions and Super Admin backend guard.
5. `.github/workflows/phase2-consolidated-safe.yml`: runs additional existing Worker/Offline/Master Control/Admin tests.

The existing Worker report submission logic, queue, TiDB database, Master Control backend authorization and report transaction paths were not modified.

## Follow-up blockers

- **D-09 PARTIAL**: check real Worker form, reload-after-save, airplane/offline and online recovery in browser using an isolated mock API. Verify no duplicate create request after reload, no lost drafts and correct worker identity.
- **D-16 PARTIAL**: actual 403/role check for lead/manager/admin_ops/regular-admin vs Super Admin on isolated server; verify rights revocation under concurrent navigation.
- **D-17 PARTIAL**: browser screenshots at 390px/desktop, dark/light; check matrix horizontal scrolling, focus indicators, accessible feedback and visual contrast.

All other records unchanged. Current overall ledger: **7 PASS, 10 PARTIAL, 3 OPEN**.

## Safety

CI only used `npm ci --ignore-scripts`, no DB credentials, no remote E2E, no merge/deploy. Cloudflare Workers Builds triggers were previously verified to include only `test`; this branch is `refactor/ktc-local-cleanup`. No production DB or NAS writes performed.

Next planned batch: **3/5 — D-11, D-13, D-14, D-15**.
