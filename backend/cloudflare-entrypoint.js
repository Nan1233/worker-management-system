import worker from "./cloudflare-worker.js";
import { initializeRuntime } from "./server.js";

// cloudflare-worker.js owns the Express/HTTP bridge and all Cloudflare-specific
// bootstrapping. In Workers, relying on app.listen(callback) for application
// startup is not reliable, so initialize the DB/schema runtime explicitly at
// module startup instead of waiting for the Node listen callback.
void initializeRuntime().catch((error) => {
  console.error("[KTC] explicit Cloudflare runtime initialization failed", error);
});

export default worker;
