const fs = require('node:fs/promises');
const path = require('node:path');

async function removeQuietly(filePath) {
  if (!filePath) return;
  await fs.rm(filePath, { force: true }).catch(() => undefined);
}

async function cleanupOldExports(root, options = {}) {
  const maxAgeMs = Math.max(Number(options.maxAgeMs || process.env.EXCEL_EXPORT_RETENTION_MS || 30 * 86400000), 3600000);
  const tempAgeMs = Math.max(Number(options.tempAgeMs || 86400000), 3600000);
  const now = Date.now();
  async function walk(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      try {
        const stat = await fs.stat(full);
        const age = now - stat.mtimeMs;
        if ((entry.name.endsWith('.tmp') && age > tempAgeMs) || (entry.name.endsWith('.xlsx') && age > maxAgeMs)) await fs.rm(full, { force: true });
      } catch { /* best effort */ }
    }
  }
  await walk(root);
}

module.exports = { removeQuietly, cleanupOldExports };
