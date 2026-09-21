import worker from "./cloudflare-worker.js";

// cloudflare-worker.js must evaluate first because it installs the Cloudflare
// env/DB globals before server.js is loaded. Use a dynamic import so the
// CommonJS server module is taken from the already-initialized module cache.
const { initializeRuntime } = await import("./server.js");

// Do not rely on app.listen(callback) for application startup in Workers.
// Initialize DB + schema explicitly during Worker module startup.
void initializeRuntime().catch((error) => {
  console.error("[KTC] explicit Cloudflare runtime initialization failed", error);
});

export default worker;
