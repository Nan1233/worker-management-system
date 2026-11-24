'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

function createExcelFileDiscovery({ writeLog, normalizeError }) {
  async function logPendingFiles(rootFolder) {
    let entries;
    try {
      entries = await fs.readdir(rootFolder, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const fullPath = path.join(rootFolder, entry.name);
      if (entry.isDirectory()) {
        await logPendingFiles(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pending.xlsx')) {
        // Pending workbooks must never be renamed over a saved user's edits.
        await writeLog('INFO', 'PENDING_FILE_WAITING_FOR_FRESH_REBUILD', { pendingPath: fullPath });
      }
    }
  }

  async function listExcelFiles(rootFolder) {
    const result = [];
    const walk = async (folder) => {
      let entries;
      try {
        entries = await fs.readdir(folder, { withFileTypes: true });
      } catch (error) {
        if (folder === rootFolder && error?.code === 'ENOENT') return;
        throw error;
      }
      for (const entry of entries) {
        const fullPath = path.join(folder, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }
        if (!entry.isFile()) continue;
        const lowerName = entry.name.toLowerCase();
        if (!lowerName.endsWith('.xlsx') || lowerName.endsWith('.pending.xlsx')
            || lowerName.endsWith('.recovery.xlsx') || lowerName.startsWith('~$')) continue;
        try {
          const handle = await fs.open(fullPath, 'r');
          try {
            const header = Buffer.alloc(4);
            const { bytesRead } = await handle.read(header, 0, 4, 0);
            if (bytesRead !== 4 || header[0] !== 0x50 || header[1] !== 0x4b
                || header[2] !== 0x03 || header[3] !== 0x04) {
              const error = new Error('Invalid XLSX signature');
              error.code = 'KTC_EXCEL_INVALID_XLSX';
              throw error;
            }
          } finally {
            await handle.close();
          }
          result.push(fullPath);
        } catch (error) {
          // Fail closed: skipping an unreadable/invalid workbook might let a
          // subsequent DB export overwrite edits that were never examined.
          await writeLog('WARN', 'EXCEL_FILE_SKIPPED_UNREADABLE', {
            filePath: fullPath, ...normalizeError(error)
          });
          throw error;
        }
      }
    };
    await walk(rootFolder);
    return result;
  }

  return { logPendingFiles, listExcelFiles };
}

module.exports = { createExcelFileDiscovery };
