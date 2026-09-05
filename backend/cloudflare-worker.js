import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import { connect as connectTiDB } from "@tidbcloud/serverless";

globalThis.__KTC_CLOUDFLARE_ENV = env;
globalThis.__KTC_CLOUDFLARE_WORKER = true;
globalThis.__KTC_TIDB_CONNECT = connectTiDB;

for (const [key, value] of Object.entries(env)) {
  if (typeof value === "string") process.env[key] = value;
}

if (typeof env.TIDB_DATABASE_URL === "string" && env.TIDB_DATABASE_URL) {
  try {
    const url = new URL(env.TIDB_DATABASE_URL);
    const database = String(env.DB_NAME || "").trim();
    if (database) url.pathname = `/${encodeURIComponent(database)}`;
    process.env.TIDB_DATABASE_URL = url.toString();
  } catch {
    process.env.TIDB_DATABASE_URL = env.TIDB_DATABASE_URL;
  }
}

// Wrangler deploys with NODE_ENV=production. Do not assign to NODE_ENV here:
// Wrangler statically defines it during bundling.
process.env.PORT = process.env.PORT || "3000";
process.env.KTC_CLOUDFLARE_WORKER = "true";

const { start, app } = require("./server.js");

// Express normally calls server.listen(port, host, callback). Cloudflare's
// Worker HTTP server supports listen(port, callback), so normalize the host
// argument only for this Worker without changing the Render server code.
const originalListen = app.listen.bind(app);
app.listen = (port, hostOrCallback, maybeCallback) => {
  if (typeof hostOrCallback === "string") {
    return originalListen(port, maybeCallback);
  }
  return originalListen(port, hostOrCallback);
};

const server = await start();

export default httpServerHandler(server);
