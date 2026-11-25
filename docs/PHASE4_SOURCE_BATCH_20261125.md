# Phase 4 — source development batch, 2026-11-25

Baseline 5c5a4ce: both isolated workflows passed. Scope follows PHASE4_SOURCE_WORKPLAN.md. No production DB, deployment, branch merge or device acceptance.

- Worker: historical standard request cache includes work date at the call sites, keys no longer collide on delimiters, expired failed requests cannot evict newer cached requests. Shared create/edit standard lookup guards responses against changed machine/product selection.
- Manager: explicit paginated Excel before/after preview, invalid-row blocking, cancel, synchronous import lock; show successful partial writes and retain source-file protection. Pending rejection dialog has focus entry/restore, Tab containment and Escape when not submitting; long dialog scrolls.
- Desktop export: show backend's actual yearly result (including empty months, skipped/no data and partial failures), rather than generic success text.
- Accessibility: busy status, scoped table headers, keyboard scroll, focus outline.
- Remaining: comprehensive role UAT, all business scenarios, real Windows paths/lock and data reconciliation deferred; check source CI on final SHA only. No claim of full Phase 4 acceptance from these changes alone.
