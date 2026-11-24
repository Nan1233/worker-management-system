'use strict';

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { hostname } = require('node:os');
const { randomUUID } = require('node:crypto');

function sameFileVersion(before, after) {
  if (!before || !after) return before === after;
  return before.size === after.size && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs && before.ino === after.ino && before.dev === after.dev;
}
function conflict(message, code = 'KTC_EXCEL_CONCURRENT_MODIFICATION') {
  return Object.assign(new Error(message), { code });
}
async function optionalStat(fileSystem, filename) {
  try { return await fileSystem.stat(filename); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}
async function withPublicationLock(fileSystem, filePath, action) {
  const lockPath = filePath + '.ktc-publish.lock';
  const token = randomUUID();
  let handle;
  try {
    handle = await fileSystem.open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw conflict('Một phiên KTC khác đang xuất file hoặc để lại khóa chưa được xử lý: ' + lockPath,
        'KTC_EXCEL_EXPORT_LOCKED');
    }
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify({
      token, pid: process.pid, hostname: hostname(), createdAt: new Date().toISOString()
    }));
    return await action();
  } finally {
    try {
      const current = JSON.parse(await fileSystem.readFile(lockPath, 'utf8'));
      const [held, pathStat] = await Promise.all([handle.stat(), fileSystem.stat(lockPath)]);
      if (current?.token === token && held.dev === pathStat.dev && held.ino === pathStat.ino) {
        await fileSystem.rm(lockPath, { force: true });
      }
    } catch (_) {
      // Preserve the original publish result; never unlink a lock we cannot verify.
    } finally {
      await handle.close().catch(() => {});
    }
  }
}

/**
 * All backend Excel publication paths share the same lock/backup semantics.
 * Never remove an existing export before a new XLSX has been fully written.
 * Recovery workbooks are excluded from the desktop XLSX discovery pipeline.
 */
async function publishExcelWorkbook(workbook, filePath, { fileSystem = fs } = {}) {
  if (!workbook?.xlsx || typeof workbook.xlsx.writeFile !== 'function') {
    throw conflict('Workbook Excel không hợp lệ', 'KTC_EXCEL_WORKBOOK_INVALID');
  }
  const target = path.resolve(filePath);
  await fileSystem.mkdir(path.dirname(target), { recursive: true });
  return withPublicationLock(fileSystem, target, async () => {
    const temporaryPath = target + '.' + process.pid + '.' + randomUUID() + '.tmp';
    let recoveryPath = null;
    try {
      await workbook.xlsx.writeFile(temporaryPath);
      const original = await optionalStat(fileSystem, target);
      if (original) {
        recoveryPath = target + '.' + randomUUID() + '.recovery.xlsx';
        await fileSystem.copyFile(target, recoveryPath, fsSync.constants.COPYFILE_EXCL);
        const [copied, afterCopy] = await Promise.all([
          fileSystem.stat(recoveryPath), fileSystem.stat(target)
        ]);
        if (copied.size !== original.size || !sameFileVersion(original, afterCopy)) {
          throw conflict('Workbook thay đổi trong lúc sao lưu recovery');
        }
      }
      const beforePublish = await optionalStat(fileSystem, target);
      if (!sameFileVersion(original, beforePublish)) {
        throw conflict('Workbook bị chỉnh sửa sau khi xuất bắt đầu, không ghi đè');
      }
      await fileSystem.rename(temporaryPath, target);
      return { archivePath: target, recoveryPath };
    } finally {
      await fileSystem.rm(temporaryPath, { force: true }).catch(() => {});
    }
  });
}
module.exports = { publishExcelWorkbook };
