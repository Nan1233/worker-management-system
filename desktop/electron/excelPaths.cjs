const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  getProcessMonthTarget,
  normalizeProcessFolder,
  processReportFileName,
} = require('./excelDualLayout.cjs');

// Test desktop uses the company NAS when it is reachable. If the NAS is
// unavailable, Excel export must transparently fall back to the local KTC
// production-report folder. The NAS remains the preferred destination.
const DEFAULT_EXPORT_ROOT = '\\\\KTCNAS\\Public\\3. SẢN XUẤT-製造\\Linh tinh';
const NAS_EXPORT_ROOT = DEFAULT_EXPORT_ROOT;
const LOCAL_FALLBACK_EXPORT_ROOT = path.join(os.homedir(), 'Documents', 'KTC', 'Bao cao san xuat');

// Gia công keeps the existing export untouched and is additionally mirrored to
// the monthly production-report folder using the approved workbook template.
const GIA_CONG_SAMPLE_ROOT = String(process.env.KTC_GIA_CONG_SAMPLE_ROOT || '').trim()
  || '\\\\KTCNAS\\Public\\3. SẢN XUẤT-製造\\3. SX2  製造2\\4. Báo cáo tháng, Báo cáo KPI, Báo cáo chi phí+ mục tiêu trọng điểm\\1. Báo cáo sản xuất';
const GIA_CONG_SAMPLE_MONTH_PREFIX = String(process.env.KTC_GIA_CONG_SAMPLE_MONTH_PREFIX || '12.').trim() || '12.';
const GIA_CONG_SAMPLE_FILE_RE = /^A\+B GIA CÔNG THÁNG (0[1-9]|1[0-2])-(\d{4})\.xlsx$/i;
const GIA_CONG_PROCESS_FILE_RE = /^04_CAT_LONG_(0[1-9]|1[0-2])-(\d{4})\.xlsx$/i;

let giaCongMirrorRunning = false;
let giaCongMirrorTimer = null;

function getDateParts(dateValue = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const [year, month, day] = formatter.format(dateValue).split('-');
  return { year, month, day, date: `${year}-${month}-${day}` };
}

function assertDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Ngày đồng bộ Excel không hợp lệ.');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Ngày đồng bộ Excel không tồn tại.');
  }
}

function safeFolderName(value, fallback = 'Cong doan') {
  return String(value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim() || fallback;
}

function safeFileName(value, fallback) {
  const candidate = safeFolderName(value, fallback);
  return candidate.toLowerCase().endsWith('.xlsx') ? candidate : `${candidate}.xlsx`;
}

function resolveExportRoot(configured) {
  const raw = String(configured || '').trim();
  const preferredRoot = !raw
    ? DEFAULT_EXPORT_ROOT
    : /^linh\s*tinh$/i.test(raw)
      ? NAS_EXPORT_ROOT
      : /^\\\\/.test(raw)
        ? raw.replace(/[\\/]+$/g, '')
        : path.resolve(raw);

  if (!/^\\\\/.test(preferredRoot)) {
    try {
      fsSync.mkdirSync(preferredRoot, { recursive: true });
      fsSync.accessSync(preferredRoot, fsSync.constants.R_OK | fsSync.constants.W_OK);
    } catch (_) {
      // A user-selected local folder may disappear. Fall back to the known
      // local KTC folder rather than breaking Excel export.
      try {
        fsSync.mkdirSync(LOCAL_FALLBACK_EXPORT_ROOT, { recursive: true });
        fsSync.accessSync(LOCAL_FALLBACK_EXPORT_ROOT, fsSync.constants.R_OK | fsSync.constants.W_OK);
        return LOCAL_FALLBACK_EXPORT_ROOT;
      } catch (_) {
        return preferredRoot;
      }
    }
    return preferredRoot;
  }

  // NAS is always preferred. Only when it cannot be created/accessed do we
  // switch to the local fallback. This keeps existing NAS behaviour unchanged
  // while preventing an offline NAS from aborting the whole export job.
  try {
    fsSync.mkdirSync(preferredRoot, { recursive: true });
    fsSync.accessSync(preferredRoot, fsSync.constants.R_OK | fsSync.constants.W_OK);
    return preferredRoot;
  } catch (_) {
    try {
      fsSync.mkdirSync(LOCAL_FALLBACK_EXPORT_ROOT, { recursive: true });
      fsSync.accessSync(LOCAL_FALLBACK_EXPORT_ROOT, fsSync.constants.R_OK | fsSync.constants.W_OK);
      return LOCAL_FALLBACK_EXPORT_ROOT;
    } catch (_) {
      // Preserve the original root if even the local fallback is unavailable;
      // the caller will surface the actual filesystem error.
      return preferredRoot;
    }
  }
}

function getExportRoot() {
  const configured = String(process.env.KTC_EXPORT_ROOT || '').trim();
  const root = resolveExportRoot(configured);

  // Keep the active root in sync so every subsequent export helper uses the
  // same NAS/local decision for this desktop session.
  process.env.KTC_EXPORT_ROOT = root;

  // Keep the existing export untouched, then asynchronously mirror only the
  // Gia công A+B workbook into its separate monthly-report destination.
  scheduleGiaCongSampleMirrorScan(root);
  return root;
}

function getGiaCongSampleFolder(year, month) {
  return path.join(GIA_CONG_SAMPLE_ROOT, year, `${GIA_CONG_SAMPLE_MONTH_PREFIX} Tháng ${month}-${year}`);
}

async function mirrorGiaCongWorkbooks(root) {
  if (giaCongMirrorRunning) return;
  giaCongMirrorRunning = true;
  try {
    const years = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const yearEntry of years) {
      if (!yearEntry.isDirectory() || !/^\d{4}$/.test(yearEntry.name)) continue;
      const year = yearEntry.name;
      const yearFolder = path.join(root, year);
      const candidateFolders = [path.join(yearFolder, 'Gia công')];
      const yearEntries = await fs.readdir(yearFolder, { withFileTypes: true }).catch(() => []);
      for (const entry of yearEntries) {
        if (!entry.isDirectory() || !/^\d{2}$/.test(entry.name)) continue;
        const monthFolder = path.join(yearFolder, entry.name);
        candidateFolders.push(monthFolder, path.join(monthFolder, 'Gia công'));
      }

      const seen = new Set();
      for (const folder of candidateFolders) {
        const entries = await fs.readdir(folder, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
          if (!entry.isFile()) continue;

          const sampleMatch = entry.name.match(GIA_CONG_SAMPLE_FILE_RE);
          const processMatch = entry.name.match(GIA_CONG_PROCESS_FILE_RE);
          if (!sampleMatch && !processMatch) continue;

          const month = sampleMatch?.[1] || processMatch?.[1];
          const sourceYear = sampleMatch?.[2] || processMatch?.[2];
          if (sourceYear !== year) continue;

          const targetName = `A+B GIA CÔNG THÁNG ${month}-${year}.xlsx`;
          const seenKey = `${month}-${year}`;
          if (seen.has(seenKey)) continue;
          seen.add(seenKey);

          const targetFolder = getGiaCongSampleFolder(year, month);
          const targetPath = path.join(targetFolder, targetName);
          const sourcePath = path.join(folder, entry.name);
          await fs.mkdir(targetFolder, { recursive: true });
          const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
          try {
            await fs.copyFile(sourcePath, temporaryPath);
            await fs.rm(targetPath, { force: true });
            await fs.rename(temporaryPath, targetPath);
          } catch (error) {
            await fs.rm(temporaryPath, { force: true }).catch(() => {});
            // The main export must never fail because the separate mirror is unavailable.
          }
        }
      }
    }
  } finally {
    giaCongMirrorRunning = false;
  }
}

function scheduleGiaCongSampleMirrorScan(root) {
  if (giaCongMirrorTimer) return;
  giaCongMirrorTimer = setTimeout(() => {
    giaCongMirrorTimer = null;
    void mirrorGiaCongWorkbooks(root).catch(() => {});
  }, 5000);
  giaCongMirrorTimer.unref?.();
}

async function findExistingProcessReportFile(folder, processInfo, month, year) {
  let entries = [];
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }

  const processFolder = normalizeProcessFolder({
    processCode: processInfo.processCode,
    processName: processInfo.processName
  });
  const compact = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const processToken = compact(processFolder);
  const targetPeriodTokens = new Set([
    compact(`${month}${year}`), compact(`${year}${month}`),
    compact(`${month}-${year}`), compact(`${year}-${month}`)
  ]);
  const periodPattern = /(?:19|20)\d{2}|(?:^|[^0-9])(0?[1-9]|1[0-2])(?:[^0-9]|$)/;

  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.xlsx'))
    .filter((entry) => !entry.name.toLowerCase().endsWith('.pending.xlsx'))
    .filter((entry) => !entry.name.toLowerCase().startsWith('a+b'))
    .map((entry) => {
      const key = compact(entry.name);
      const baseName = entry.name.replace(/\.xlsx$/i, '');
      const hasTargetPeriod = [...targetPeriodTokens].some((token) => key.includes(token));
      const hasAnyPeriod = periodPattern.test(baseName);
      return { entry, key, hasTargetPeriod, hasAnyPeriod };
    })
    .filter(({ key }) => key.includes('baocao') && key.includes(processToken))
    .filter(({ hasTargetPeriod, hasAnyPeriod }) => hasTargetPeriod || !hasAnyPeriod)
    .map((item) => {
      const keyWithoutExtension = item.key.replace(/xlsx$/, '');
      const exactGenericNames = new Set([
        `baocao${processToken}`,
        `baocaosanxuat${processToken}`,
        `baocao${processToken}thang`
      ]);
      let score = item.hasTargetPeriod ? 200 : 0;
      if (exactGenericNames.has(keyWithoutExtension)) score += 100;
      if (item.key === `baocao${processToken}xlsx`) score += 110;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));

  return candidates.length > 0 ? candidates[0].entry.name : null;
}

async function getProcessExportPath(date, processInfo, serverFileName) {
  assertDate(date);
  const [year, month] = date.split('-');
  const root = getExportRoot();
  const processFolder = normalizeProcessFolder({
    processCode: processInfo.processCode,
    processName: processInfo.processName
  });
  const folder = path.join(root, year, processFolder);
  await fs.mkdir(folder, { recursive: true });

  const existingFileName = await findExistingProcessReportFile(folder, processInfo, month, year);
  const canonicalName = processReportFileName({
    processCode: processInfo.processCode,
    processName: processInfo.processName,
    month,
    year
  });

  return getProcessMonthTarget({
    root,
    date,
    processCode: processInfo.processCode,
    processName: processInfo.processName,
    fileName: existingFileName || canonicalName || serverFileName
  });
}

async function cleanupMisplacedCompanyFiles(root, date, writeLog = async () => {}) {
  assertDate(date);
  const [year, month] = date.split('-');
  const monthFolder = path.join(root, year, month);
  const processFolders = ['Gia công', 'Mài - Đo', 'Mài', 'Đo', 'Kiểm 1', 'Kiểm 2', 'Ép', 'Cán', 'Xử lý bavia'];

  for (const processFolder of processFolders) {
    const folder = path.join(root, year, processFolder);
    let entries = [];
    try {
      entries = await fs.readdir(folder, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (!lower.startsWith('a+b') || !lower.endsWith('.xlsx')) continue;
      const misplacedPath = path.join(folder, entry.name);
      const correctPath = path.join(monthFolder, entry.name);
      try {
        await fs.access(correctPath);
        await fs.rm(misplacedPath, { force: true });
        await writeLog('INFO', 'MISPLACED_AB_REMOVED', { misplacedPath, correctPath });
      } catch {
        await writeLog('WARN', 'MISPLACED_AB_KEPT_NO_MONTH_COPY', { misplacedPath, correctPath });
      }
    }
  }
}

module.exports = {
  getDateParts,
  assertDate,
  safeFolderName,
  safeFileName,
  getExportRoot,
  getProcessExportPath,
  cleanupMisplacedCompanyFiles,
  getGiaCongSampleFolder,
  mirrorGiaCongWorkbooks,
  scheduleGiaCongSampleMirrorScan,
};
