# KTC Phase 4 — source-only development workplan

Status: **PROPOSED SCOPE — not yet accepted**. This document is a planning handoff, not proof of feature completion.

## Development sequence (no live TiDB required)

1. **UI/UX flow audit:** worker entry and validation, lead/manager pending/approved review, admin master data, navigation and mobile responsiveness. Document actual issues from existing frontend code and reproduce with tests before changes.
2. **Functional regression:** approval/rejection/edit conflicts, 14-day backdating, historical standard snapshots, GC shared/auto machine output and separate worker credit. Extend unit/contract tests using synthetic fixtures; avoid real employee records.
3. **Excel usability:** desktop monthly export error feedback, clear progress, consistent labels, Windows path handling, and machine output reconciliation using synthetic XLSX smoke tests.
4. **Accessibility and stability:** keyboard focus, table scroll and sticky columns, loading/empty/error states, permission-denied messages, and production bundle checks.
5. **Source verification:** frontend lint/typecheck/test/build; backend tests/audit; desktop Linux/Windows smoke; staging-safety contract tests; record PR-head and merge-commit evidence separately.

## Explicitly deferred to final integration

- Independently isolated TiDB staging instance, migration and restore rehearsal.
- All 24 write-capable E2E scenarios and real manager/lead/worker UAT.
- Target KTC Windows workstation acceptance, database reconciliation, release go/no-go.
- Any production deployment or changes to production TiDB.

## Exit evidence

For each implemented feature, link its PR, reproducible issue, test coverage and CI run. Do not mark an item complete based only on this plan. No write-path tests may target remote Cloudflare Workers or production TiDB.
