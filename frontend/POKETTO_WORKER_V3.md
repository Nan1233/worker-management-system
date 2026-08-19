# Poketto Worker V3 — page layer

The Worker shell now uses the real Poketto Stack primitives. This phase adds a template-native Worker landing page and a reusable page frame.

Existing KTC production/history/notification/profile pages and services are intentionally not rewritten blindly: their business logic and routes remain intact. The next integration step is to map each existing page into `WorkerPageFrame` while preserving its current data and actions.

No backend or Approve/Reject code was changed.
