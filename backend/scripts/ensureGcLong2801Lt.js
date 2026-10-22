'use strict';

const db = require('../config/db');

async function ensureGcLong2801Lt() {
  // Legacy bootstrap compatibility only. The canonical current master uses
  // QC3-2801 and is maintained by migrations/master data, so do not recreate
  // 2801-LT rows here. Keeping this module available prevents Cloudflare's
  // Worker bundle from failing on the legacy require in cloudflare-worker.js.
  const [processRows] = await db.promise().query(
    "SELECT id FROM processes WHERE UPPER(TRIM(process_code)) = 'GC' LIMIT 1"
  );
  const processId = Number(processRows?.[0]?.id || 0);
  if (!processId) return true;
  return true;
}

module.exports = ensureGcLong2801Lt;

// Command-line entry (`npm start` pre-step, `npm run db:ensure-gc-long-2801-lt`).
// config/db keeps a connection pool and timers alive, so without an explicit exit the process
// never terminated and `npm start` hung forever before it reached server.js. The sibling
// ensureGcDefectMasterData.js already ends this way.
if (require.main === module) {
  ensureGcLong2801Lt()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[KTC] ensureGcLong2801Lt failed:', error && error.message ? error.message : error);
      process.exit(1);
    });
}
