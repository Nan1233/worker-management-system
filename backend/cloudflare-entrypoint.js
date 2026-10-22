import worker from "./cloudflare-worker.js";

// The Worker never runs schema migrations (no build, startup or request hook). They are a manual,
// backed-up operator action; KTC_RUN_BUILD_DB_MIGRATIONS is "false" in wrangler.jsonc and nothing reads it.
//
// Master-data writes stay off; that bootstrap is a separate repair path.
process.env.KTC_RUN_MASTER_DATA_BOOTSTRAP = "false";

export default worker;
