# Phase 4 — Admin, accessibility and interaction stability

Base e3f4b6d passed both isolated CI workflows. Source changes in this batch:
- Admin catalog: prevent operations against stale/failed catalog loads; synchronous mutation lock, distinct create/edit capability, multi-process user filtering, no hydration of password/token/secret fields, keyboard focus and mobile controls.
- Permissions: prevent further writes from stale matrix following a failed refresh; scope remains enforced by backend.
- Worker: avoid nested state updates/toasts from deduction updater callbacks; preserve twelve-hour guard and existing calculation helper; clear dated standard cache on master-data invalidation.
- Network banner: distinguish browser offline from API connection failures using existing runtime events; do not claim unacknowledged writes saved.
- Permission hook: ignore stale async responses after auth transition/unmount; fail closed.

Remaining evidence: final isolated CI, full role/business UAT, actual KTC Windows/Excel device behavior, live authorized reconciliation and deployment readiness. No production data writes, merges or deployment.
