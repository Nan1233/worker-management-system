import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import { createRequire } from "node:module";

// Bridge the existing CommonJS/Express application into the Cloudflare Worker
// runtime without changing the Render startup path.
const require = createRequire(import.meta.url);

globalThis.__KTC_CLOUDFLARE_ENV = env;
globalThis.__KTC_HYPERDRIVE = env.HYPERDRIVE;

// Existing KTC modules read configuration from process.env. Worker bindings
// and secrets are copied into that compatibility layer at startup.
for (const [key, value] of Object.entries(env)) {
  if (typeof value === "string") process.env[key] = value;
}

process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.PORT = process.env.PORT || "3000";
process.env.KTC_CLOUDFLARE_WORKER = "true";

const { start } = require("./server.js");

await start();

export default httpServerHandler({ port: 3000 });
