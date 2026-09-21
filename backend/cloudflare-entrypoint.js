import worker from "./cloudflare-worker.js";

// cloudflare-worker.js must evaluate first because it installs the Cloudflare
// env/DB globals before server.js is loaded. Use a dynamic import so the
// CommonJS server module is taken from the already-initialized module cache.
const { initializeRuntime, runtimeReadiness } = await import("./server.js");

// Cloudflare Workers can start before external bindings/database connectivity
// is available. Initialize immediately, then retry without requiring a manual
// redeploy/restart when TiDB becomes available later.
async function initializeWithRetry() {
  if (runtimeReadiness.ready || runtimeReadiness.initializing) return;
  try {
    await initializeRuntime();
  } catch (error) {
    console.error("[KTC] explicit Cloudflare runtime initialization failed", error);
  }
  if (!runtimeReadiness.ready) {
    setTimeout(() => void initializeWithRetry(), 5000);
  }
}

void initializeWithRetry();

export default worker;
