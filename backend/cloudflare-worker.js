import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import { createRequire } from "node:module";

// Bridge the existing CommonJS/Express application into the Cloudflare Worker
// runtime without changing the Render startup path.
const require = createRequire(import.meta.url);
const hyperdrive = env.HYPERDRIVE;

globalThis.__KTC_CLOUDFLARE_ENV = env;
globalThis.__KTC_HYPERDRIVE = hyperdrive;

// Existing KTC modules read configuration from process.env. Copy ordinary
// Worker variables/secrets and expose Hyperdrive credentials through the same
// names expected by the existing validation layer.
for (const [key, value] of Object.entries(env)) {
  if (typeof value === "string") process.env[key] = value;
}

if (hyperdrive) {
  process.env.DB_HOST = hyperdrive.host;
  process.env.DB_PORT = String(hyperdrive.port || 3306);
  process.env.DB_USER = hyperdrive.user;
  process.env.DB_PASSWORD = hyperdrive.password;
  process.env.DB_NAME = hyperdrive.database;
  process.env.DB_SSL = "true";
}

process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.PORT = process.env.PORT || "3000";
process.env.KTC_CLOUDFLARE_WORKER = "true";

const { start } = require("./server.js");

await start();

export default httpServerHandler({ port: 3000 });
