import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import { createRequire } from "node:module";
import { connect as connectTiDB } from "@tidbcloud/serverless";

// Bridge the existing CommonJS/Express application into the Cloudflare Worker
// runtime without changing the Render startup path.
const require = createRequire(import.meta.url);

globalThis.__KTC_CLOUDFLARE_ENV = env;
globalThis.__KTC_TIDB_CONNECT = connectTiDB;

// Existing KTC modules read configuration from process.env. Copy ordinary
// Worker variables/secrets so the existing validation layer keeps working.
for (const [key, value] of Object.entries(env)) {
  if (typeof value === "string") process.env[key] = value;
}

process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.PORT = process.env.PORT || "3000";
process.env.KTC_CLOUDFLARE_WORKER = "true";

const { start } = require("./server.js");

await start();

export default httpServerHandler({ port: 3000 });
