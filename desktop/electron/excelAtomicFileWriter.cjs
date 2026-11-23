'use strict';

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Factory keeps environment-specific logging, backup policy and path handling injectable.
function createExcelAtomicWriter({ writeLog, getExportRoot, getDocumentsRoot, safeFolderName,
  assertDate, pruneExcelBackupRetention, normalizeError, RETRY_COUNT, RETRY_DELAY_MS, wait }) {
async function backupExistingExcel(filePath, syncDate) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;

    assertDate(syncDate);
    const [year, month] = syncDate.split('-');
    const relative = path.relative(getExportRoot(), filePath);
    const relativeParts = relative.split(path.sep);
    const processName = safeFolderName(relativeParts.length >= 2 ? relativeParts[1] : 'Tong hop');
    const processBackupRoot = path.join(
      getDocumentsRoot(),
      'KTC',
      'Backup',
      'Excel',
      processName
    );
    const monthFolder = path.join(processBackupRoot, year, month);
    const backupPath = path.join(
      monthFolder,
      `${path.basename(filePath, '.xlsx')}_${syncDate}.xlsx`
    );

    await fs.mkdir(monthFolder, { recursive: true });

    try {
      await fs.copyFile(filePath, backupPath, fsSync.constants.COPYFILE_EXCL);
      await writeLog('INFO', 'EXCEL_DAILY_BACKUP_CREATED', { filePath, backupPath, syncDate });
      await pruneExcelBackupRetention(processBackupRoot);
      return backupPath;
    } catch (error) {
      if (error?.code === 'EEXIST') {
        await writeLog('INFO', 'EXCEL_DAILY_BACKUP_ALREADY_EXISTS', { filePath, backupPath, syncDate });
        await pruneExcelBackupRetention(processBackupRoot);
        return backupPath;
      }
      throw error;
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    await writeLog('ERROR', 'EXCEL_BACKUP_FAILED', { filePath, syncDate, ...normalizeError(error) });
    throw new Error(`Không thể sao lưu file Excel trước khi cập nhật: ${error.message}`);
  }
}



async function performAtomicOverwrite(filePath, buffer, syncDate) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const backupPath = await backupExistingExcel(filePath, syncDate);
  // The backup must be the exact version we are about to replace. A workbook
  // edited after backup creation must not be overwritten with an older export.
  const originalStat = await fs.stat(filePath).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  // A once-per-day backup may be older than the current workbook. Keep a
  // unique recovery copy for every overwrite, including later edits that day.
  const recoveryPath = originalStat ? path.join(
    getDocumentsRoot(), 'KTC', 'Backup', 'Excel', 'Recovery',
    `${path.basename(filePath, '.xlsx')}.${randomUUID()}.xlsx`
  ) : null;
  if (recoveryPath) {
    await fs.mkdir(path.dirname(recoveryPath), { recursive: true });
    await fs.copyFile(filePath, recoveryPath, fsSync.constants.COPYFILE_EXCL);
    const afterCopy = await fs.stat(filePath);
    if (afterCopy.mtimeMs !== originalStat.mtimeMs || afterCopy.size !== originalStat.size) {
      const conflict = new Error('Workbook changed during recovery snapshot');
      conflict.code = 'KTC_EXCEL_CONCURRENT_MODIFICATION';
      throw conflict;
    }
  }
  try {
    await fs.writeFile(temporaryPath, buffer, { flag: 'wx' });
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }

  let lastError;
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
    try {
      // Rename within the same directory is an atomic replacement when the
      // target is unlocked. NEVER delete the old workbook first: if rename
      // subsequently fails, the user must retain their last good report.
      const currentStat = await fs.stat(filePath).catch((error) => {
        if (error?.code === 'ENOENT') return null;
        throw error;
      });
      if ((originalStat === null) !== (currentStat === null)
          || (originalStat && currentStat &&
            (originalStat.mtimeMs !== currentStat.mtimeMs || originalStat.size !== currentStat.size))) {
        const conflict = new Error('File Excel đã được chỉnh sửa sau khi bắt đầu xuất. Không ghi đè thay đổi mới.');
        conflict.code = 'KTC_EXCEL_CONCURRENT_MODIFICATION';
        throw conflict;
      }
      await fs.rename(temporaryPath, filePath);
      // Pending chỉ là bản chờ khi file đang khóa. Khi lần đồng bộ mới đã ghi
      // thành công từ dữ liệu DB mới nhất, xóa pending cũ để tránh áp dụng dữ liệu cũ.
      await fs.rm(`${filePath}.pending.xlsx`, { force: true }).catch(() => {});
      return { saved: true, pendingPath: null, backupPath, recoveryPath };
    } catch (error) {
      lastError = error;
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === RETRY_COUNT) break;
      await wait(RETRY_DELAY_MS * attempt);
    }
  }

  // A pending copy is appropriate only for a locked destination. Permission,
  // disk or filesystem errors must surface rather than masquerade as a lock.
  if (!lastError || !['EPERM', 'EACCES', 'EBUSY'].includes(lastError.code)) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw lastError || new Error('Excel atomic replacement failed');
  }

  const pendingPath = `${filePath}.pending.xlsx`;
  try {
    // Replace pending atomically without deleting the previous good pending
    // copy first. If rename fails, leave the previous pending intact.
    await fs.rename(temporaryPath, pendingPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }

  // Do not close/reopen a user's Excel workbook automatically. COM can see
  // only one Excel instance, and another Excel/WPS instance may have unsaved
  // edits. Keep the pending workbook for explicit user-controlled recovery.
  const reloadResult = { reason: 'manual-replacement-required' };
  await writeLog('WARN', 'FILE_LOCKED_PENDING_CREATED', {
    filePath,
    pendingPath,
    code: lastError?.code,
    errorMessage: lastError?.message,
    reason: reloadResult.reason,
    excelWorkbookStillOpen: true,
    hint: 'Workbook replacement was deferred. Save and close Excel/WPS in all instances, inspect the pending copy, then explicitly retry the export.'
  });
  return {
    saved: false,
    pendingPath,
    backupPath,
    recoveryPath,
    waitingForExcelSave: true
  };
}


// Serialize writes to the same destination. Without this queue, an older
// pending replacement can race with a newer export and overwrite its data.
const fileQueues = new Map();
function atomicOverwrite(filePath, buffer, syncDate) {
  const key = path.resolve(filePath);
  const previous = fileQueues.get(key) || Promise.resolve();
  const operation = previous.catch(() => {}).then(() => performAtomicOverwrite(key, buffer, syncDate));
  const settled = operation.then(() => {}, () => {});
  fileQueues.set(key, settled);
  void settled.then(() => {
    if (fileQueues.get(key) === settled) fileQueues.delete(key);
  });
  return operation;
}

return { atomicOverwrite };
}

module.exports = { createExcelAtomicWriter };
