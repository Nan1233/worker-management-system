# Phase 4 final navigation follow-up

Baseline 2499989: consolidated source workflow 45749446771 passed 6/6; isolated acceptance 45749446789 passed TiDB HTTP and Windows packaging but failed browser gate with 21 passed, 1 flaky. Mobile Admin drawer target became invisible during navigation to Approved Reports; retry succeeded. This is not a clean acceptance.

Changes: scope lazy-route Suspense to Admin outlet so the surrounding navigation remains available; expose drawer expanded/controls state and make mobile drawer/overflow mutually exclusive. Browser regression checks actual destination heading and drawer lifecycle, not only a changed hash. No timeouts/retries increased or tests skipped. Root cause hypothesis is lazy route transitions hiding the shell, to be verified on the new SHA.

No merge, deployment, shared TEST or production DB change. Real workstation and authorized data reconciliation remain deferred. Do not claim green acceptance until both required workflows finish on the new SHA.
