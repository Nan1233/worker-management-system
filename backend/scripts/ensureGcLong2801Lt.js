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
