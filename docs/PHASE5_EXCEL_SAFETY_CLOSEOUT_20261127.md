# Phase 5 Excel safety follow-up

4c330a4 passed source and readiness CI (7/7). Its changes were source audit only; isolated system CI on ab47652 was 3/3.

Fix normalized NG/hour totals in monthly detail mapping (canonical value before stale SQL aliases); fix local fixture SQL parameter count. Legacy bulk Excel IPC now requires one unchanged preview scoped to month and token fingerprint; validates file inventory/version and operation IDs before submission, blocks rebuild on changed files. Refreshing credentials requires a new preview. Tests use a synthetic temporary file and mocked HTTP; no real DB or Excel file mutation.

Known limits: this is not an atomic cross-file DB transaction; a file changed during a batch may leave acknowledged writes, which must be reconciled rather than overwritten. Actual Excel/WPS device acceptance and live data reconciliation remain unverified. No merge, deploy, production signing or live DB access.
