import worker from "./cloudflare-worker.js";

// TEST DB is provisioned from the clean SQL snapshot. Do not run runtime DB
// migrations or master-data writes from the request/bootstrap path; login and
// normal API requests must not fail because a repair seed is running.
process.env.KTC_RUN_BUILD_DB_MIGRATIONS = "false";
process.env.KTC_RUN_MASTER_DATA_BOOTSTRAP = "false";

export default worker;
