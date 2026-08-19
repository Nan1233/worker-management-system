# Worker V8 — actual page migration

- Profile.tsx is now directly implemented with Poketto/shadcn-style components while preserving its `/workers/me` data flow.
- ProductionDetail.tsx is wrapped in the real Poketto Worker page frame; all existing report data/rendering logic remains.
- SelectProcess.tsx receives the Poketto surface/card layer without changing its access control, prefetching, navigation, or process selection logic.
- No backend, API contracts, production validation, Approve/Reject, or database code changed.
