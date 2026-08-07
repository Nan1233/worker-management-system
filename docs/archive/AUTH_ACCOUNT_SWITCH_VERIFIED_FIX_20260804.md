# Account switch verified fix

- Clear all session-scoped API caches whenever auth is cleared.
- Invalidate pending cache promises so an old `/workers/me` response cannot repopulate the cache after account switch.
- Scope `current-worker` cache by `user.id`.
- Preserve the existing stale-refresh cancellation logic.
