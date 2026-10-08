import worker from "./cloudflare-worker.js";

// Runtime migrations are now driven by wrangler.jsonc rather than forced off
// here. This override used to win unconditionally, because ESM evaluates the
// imported module above before this body runs, so KTC_RUN_BUILD_DB_MIGRATIONS
// from the Worker vars was dead on arrival and the test database silently
// stopped migrating.
//
// Two things make the bootstrap path safe to leave on now: KTC_MIGRATION_MAX
// caps how far the runner may advance on its own, so it cannot reach the
// destructive master-data migrations unattended, and a migration failure on the
// request path is logged and stepped over instead of returning 503 - which is
// what this comment originally warned about.
//
// Master-data writes stay off; that bootstrap is a separate repair path.
process.env.KTC_RUN_MASTER_DATA_BOOTSTRAP = "false";

export default worker;
