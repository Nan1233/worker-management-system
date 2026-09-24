import worker from "./cloudflare-worker.js";

// TEST DB is provisioned from the clean SQL snapshot. Do not run runtime DB
// migrations from the login/bootstrap path; login must not return 503 merely
// because migration state is incomplete or still being processed.
process.env.KTC_RUN_BUILD_DB_MIGRATIONS = "false";

export default worker;
