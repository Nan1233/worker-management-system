import worker from "./cloudflare-worker.js";

// cloudflare-worker.js owns Cloudflare bootstrap and runtime initialization.
// Do not start a second initialization loop here: it can race the first DB
// connection/schema check and leave /api/health stuck at STARTUP_FAILED even
// after the Cloudflare master-data bootstrap has successfully connected to TiDB.
// cloudflare-worker.js retries initializeRuntime after its bootstrap succeeds.
export default worker;
