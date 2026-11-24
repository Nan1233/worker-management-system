'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

function createExcelFileDiscovery({ writeLog, normalizeError }) {
async function logPendingFiles(rootFolder) {
  let entries;
  try { entries = await fs.readdir(rootFolder, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const fullPath = path.join(rootFolder, entry.name);
    if (entry.isDirectory()) {
      await logPendingFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.pending.xlsx')) {
      // Không tự đổi tên pending thành file chính. Lần đồng bộ kế tiếp phải lấy
      // lại dữ liệu DB và chạy lại workbook; pending chỉ được xóa khi ghi mới thành công.
      await writeLog('INFO', 'PENDING_FILE_WAITING_FOR_FRESH_REBUILD', { pendingPath: fullPath });
    }
  }
}

async function listExcelFiles(rootFolder) {
  const result = [];
  const walk = async (folder) => {
    let entries;
    try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch (error) {
      if (folder === rootFolder && error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(full);
else if (
  entry.isFile() &&
  entry.name.toLowerCase().endsWith('.xlsx') &&
  !entry.name.toLowerCase().endsWith('.pending.xlsx') &&
  !entry.name.toLowerCase().endsWith('.recovery.xlsx') &&
  !entry.name.startsWith('~
) {
  try {
    const handle = await fs.open(full, 'r');

    try {
      const header = Buffer.alloc(4);
      const { bytesRead } = await handle.read(header, 0, 4, 0);

      // XLSX thực chất là ZIP, phải bắt đầu bằng PK 03 04.
      const isValidXlsx =
        bytesRead === 4 &&
        header[0] === 0x50 &&
        header[1] === 0x4b &&
        header[2] === 0x03 &&
        header[3] === 0x04;

      if (!isValidXlsx) {
        await writeLog('WARN', 'EXCEL_FILE_SKIPPED_INVALID_XLSX', {
          filePath: full
        });
        throw Object.assign(new Error('Invalid XLSX signature'), { code: 'KTC_EXCEL_INVALID_XLSX' });
      }
    } finally {
      await handle.close();
    }

    result.push(full);
  } catch (error) {
    await writeLog('WARN', 'EXCEL_FILE_SKIPPED_UNREADABLE', {
      filePath: full,
      ...normalizeError(error)
    });
    throw error;
  }
}    }
  };
  await walk(rootFolder);
  return result;
}


  return { logPendingFiles, listExcelFiles };
}

module.exports = { createExcelFileDiscovery };
)
) {
  try {
    const handle = await fs.open(full, 'r');

    try {
      const header = Buffer.alloc(4);
      const { bytesRead } = await handle.read(header, 0, 4, 0);

      // XLSX thực chất là ZIP, phải bắt đầu bằng PK 03 04.
      const isValidXlsx =
        bytesRead === 4 &&
        header[0] === 0x50 &&
        header[1] === 0x4b &&
        header[2] === 0x03 &&
        header[3] === 0x04;

      if (!isValidXlsx) {
        await writeLog('WARN', 'EXCEL_FILE_SKIPPED_INVALID_XLSX', {
          filePath: full
        });
        continue;
      }
    } finally {
      await handle.close();
    }

    result.push(full);
  } catch (error) {
    await writeLog('WARN', 'EXCEL_FILE_SKIPPED_UNREADABLE', {
      filePath: full,
      ...normalizeError(error)
    });
  }
}    }
  };
  await walk(rootFolder);
  return result;
}


  return { logPendingFiles, listExcelFiles };
}

module.exports = { createExcelFileDiscovery };
