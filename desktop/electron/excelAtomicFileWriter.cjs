'use strict';

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

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



function escapePowerShellLiteral(value) {
  return String(value || '').replace(/'/g, "''");
}

async function reloadOpenExcelWorkbook(filePath, replacementPath) {
  if (process.platform !== 'win32') return { handled: false, reason: 'not-windows' };

  const target = escapePowerShellLiteral(path.resolve(filePath));
  const replacement = escapePowerShellLiteral(path.resolve(replacementPath));
  const script = `
$ErrorActionPreference = 'Stop'
$target = '${target}'
$replacement = '${replacement}'
try {
  $excel = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
} catch {
  Write-Output '{"handled":false,"reason":"excel-not-running"}'
  exit 0
}
$workbook = $null
foreach ($book in $excel.Workbooks) {
  if ([string]::Equals($book.FullName, $target, [System.StringComparison]::OrdinalIgnoreCase)) {
    $workbook = $book
    break
  }
}
if ($null -eq $workbook) {
  Write-Output '{"handled":false,"reason":"workbook-not-open"}'
  exit 0
}
if (-not $workbook.Saved) {
  Write-Output '{"handled":true,"reloaded":false,"reason":"unsaved-changes"}'
  exit 0
}
$wasActive = $workbook.Application.ActiveWorkbook -eq $workbook
$workbook.Close($false)
Copy-Item -LiteralPath $replacement -Destination $target -Force
Remove-Item -LiteralPath $replacement -Force -ErrorAction SilentlyContinue
$opened = $excel.Workbooks.Open($target)
$excel.CalculateFullRebuild()
$opened.Save()
if ($wasActive) { $opened.Activate() }
Write-Output '{"handled":true,"reloaded":true,"reason":"reopened"}'
`;

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script
    ], { windowsHide: true, timeout: 45_000, maxBuffer: 1024 * 1024 });
    const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
    const last = lines[lines.length - 1];
    return last ? JSON.parse(last) : { handled: false, reason: 'empty-response' };
  } catch (error) {
    await writeLog('WARN', 'EXCEL_COM_RELOAD_FAILED', { filePath, replacementPath, ...normalizeError(error) });
    return { handled: false, reason: 'powershell-error' };
  }
}

async function atomicOverwrite(filePath, buffer, syncDate) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const backupPath = await backupExistingExcel(filePath, syncDate);
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
      await fs.rename(temporaryPath, filePath);
      // Pending chỉ là bản chờ khi file đang khóa. Khi lần đồng bộ mới đã ghi
      // thành công từ dữ liệu DB mới nhất, xóa pending cũ để tránh áp dụng dữ liệu cũ.
      await fs.rm(`${filePath}.pending.xlsx`, { force: true }).catch(() => {});
      return { saved: true, pendingPath: null, backupPath };
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
    await fs.rm(pendingPath, { force: true });
    await fs.rename(temporaryPath, pendingPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }

  const reloadResult = await reloadOpenExcelWorkbook(filePath, pendingPath);
  if (reloadResult.reloaded) {
    await writeLog('INFO', 'OPEN_EXCEL_RELOADED', { filePath, backupPath });
    return { saved: true, pendingPath: null, backupPath, reloadedOpenWorkbook: true };
  }

  await writeLog('WARN', 'FILE_LOCKED_PENDING_CREATED', {
    filePath,
    pendingPath,
    code: lastError?.code,
    errorMessage: lastError?.message,
    reason: reloadResult.reason,
    excelWorkbookStillOpen: reloadResult.reason === 'unsaved-changes',
    hint: reloadResult.reason === 'unsaved-changes'
      ? 'Excel still reports this workbook as open with unsaved changes. Save and close it in every Excel instance; also check WPS.'
      : 'Target is still locked or inaccessible. Close Excel/WPS, check file permissions and syncing software, then retry.'
  });
  return {
    saved: false,
    pendingPath,
    backupPath,
    waitingForExcelSave: reloadResult.reason === 'unsaved-changes'
  };
}


return { atomicOverwrite };
}

module.exports = { createExcelAtomicWriter };
