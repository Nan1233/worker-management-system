'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

// Retain the current post-export legacy cleanup policy in an isolated helper.
async function cleanupLegacyMonthlyLayout(root, date, keepFileNames = [], writeLog = async () => {}) {
  try {
    const [year, month] = String(date).split('-');
    const monthFolder = path.join(root, year, month);
    const keep = new Set((keepFileNames || []).map((name) => String(name).toLowerCase()));
    const processFileRe = new RegExp('^\\d{2}_[A-Z0-9_]+_' + month + '-' + year + '\\.xlsx$', 'i');
    const entries = await fs.readdir(monthFolder, { withFileTypes: true }).catch(() => []);
    const removed = [];
    for (const entry of entries) {
      const full = path.join(monthFolder, entry.name);
      if (entry.isDirectory()) continue;
      const lower = entry.name.toLowerCase();
      if (keep.has(lower)) continue;
      const legacySummary = /^00_TONG_HOP_SAN_XUAT_\d{2}-\d{4}\.xlsx$/i.test(entry.name);
      const staleProcessFile = processFileRe.test(entry.name);
      const leftover = /\.pending\.xlsx$/i.test(entry.name) || /\.tmp$/i.test(entry.name);
      if (legacySummary || staleProcessFile || leftover) {
        await fs.rm(full, { force: true });
        removed.push(entry.name);
      }
    }
    if (removed.length) await writeLog('INFO', 'EXCEL_MONTH_FOLDER_CLEANED', { monthFolder, removed });
  } catch (error) {
    await writeLog('WARN', 'EXCEL_LEGACY_LAYOUT_CLEANUP_FAILED', { root, date, message: error?.message || String(error) });
  }
}

module.exports = { cleanupLegacyMonthlyLayout };
