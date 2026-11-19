# KTC — Giai đoạn 10/10: final release audit (not a production release)

Date: 2026-11-19. Source branch `refactor/ktc-local-cleanup`. Decision: **NO-GO / NOT APPROVED**.

## Final inspection

- GitHub Actions at audit time: [Phase 9 run 44519583572](https://github.com/Nan1233/worker-management-system/actions/runs/44519583572) pending; Phase 8 run 44519208571 cancelled; Phase 7 run 44518524604 cancelled; Phase 6 run 44518269795 cancelled; Phase 5 run 44517973721 cancelled; earlier browser run 44517341120 failed because the test asserted a 23-character value for a 20-character input (the test was corrected in Phase 5, but green browser rerun has not been verified).
- Historical [run 44511311244](https://github.com/Nan1233/worker-management-system/actions/runs/44511311244) was green 292/292 selected Node tests, but it predates Phases 3–10 and **does not certify current HEAD**.
- Final workflow source review removed a duplicate invocation of `tests/proposalReviewRollback.behavior.test.js` from the Backend job; all five isolated jobs and the all-success summary gate remain.
- Phase 3: Chromium public route smoke and Windows synthetic XLSX CI were added; current browser gate unverified.
- Phase 4: hidden `_KTC_SYNC` duplicate report IDs rejected.
- Phase 5: corrected Chromium maxlength assertion and added synthetic invalid-token route smoke.
- Phase 6: mock transactional stale-version 409/ROLLBACK/zero-write regression.
- Phase 7: historical KPI immutability and physical shared-event deduplication regressions.
- Phase 8: invalid NG/deduction Excel values fail closed rather than silently erasing approved details.
- Phase 9: Windows release signing/update/portable/deployment source-level tests added; **no signed installer or installed device UAT**.

## Deferred verification ledger

The existing `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md` remains the authoritative list of 20 gates. Current evidence-based classification: **8 PASS, 11 PARTIAL, 1 OPEN**. D-07 overall acceptance is OPEN. Do not convert PARTIAL to PASS based solely on mock tests, source changes, or CI jobs that are pending/cancelled.

### Blocking items, by area

1. Browser/roles: D-04, D-05, D-09, D-17 require authenticated Manager/Admin/Worker flows, pending/approved interaction, offline/draft and mobile responsive visual UAT.
2. Disposable TiDB: D-11, D-13, D-14, D-15, D-16 require real concurrent transaction, rollback, idempotency, RBAC and historical standard/snapshot/shared-machine parity.
3. Desktop: D-18 requires NSIS + portable build/signature verification, installed Windows smoke, upgrade/rollback and actual device UAT.
4. Excel: D-19 requires complete NG/deduction edit roundtrip, import preview and server-side version conflict with disposable DB.
5. D-07 cross-system release gate and authorized sign-off cannot close until the above are verified.

## Required order before any production release

1. Wait for a **completed/success** consolidated run at the **latest code SHA**; investigate and fix any red job, then rerun affected checks. Confirm Cloudflare build triggers remain restricted to the test branch and no unintended deployment was triggered.
2. Provision a disposable TiDB test database and synthetic seeded accounts; execute concurrent role/transaction/history/Excel-CAS E2E without accessing production or shared TEST DB.
3. Run real authenticated browser and mobile UAT against that isolated backend.
4. Build and inspect Windows NSIS/portable artifacts with controlled signing; install and smoke-test on a real Windows device, including Excel file preview, import and rollback.
5. Record test artifacts and exact SHAs against each D-ID; get explicit authorized release approval. Only then separately consider merge/deploy.

**No merge, deploy, production/shared TEST DB write or company NAS/Documents write was intentionally performed in this phase.** No signing credentials used. No claims of end-to-end acceptance or completed production rollout.
