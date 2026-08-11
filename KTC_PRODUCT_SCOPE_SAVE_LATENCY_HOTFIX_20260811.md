# KTC product scope + save latency hotfix — 2026-08-11

## Product suggestions
- Prevent stale master-data responses from a previous process from overwriting the currently opened process.
- Filter machine/product master data defensively by requested `process_id` / `process_code` before storing it in UI state.
- Product cache key now contains both `process_id` and `process_code` to prevent cross-scope collisions.
- Prefetch API accepts `processCode` so prefetched product data uses the same scope as the worker page.

## Save latency
- Multi-machine validation no longer performs machine/product lookups serially for each machine line.
- Machine lookups execute as one concurrent wave; product-standard lookups execute as a second concurrent wave.
- Factory rule, machine capacity, and master-data validation execute concurrently after machine-line validation.
- No business validation was removed.

## Verification
- Backend: `npm --prefix backend test` => 124/124 passed.
- Frontend typecheck requires dependencies (`node_modules`) to be installed in the extracted source first.
