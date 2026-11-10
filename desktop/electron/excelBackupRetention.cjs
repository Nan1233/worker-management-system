"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

// The caller supplies its logger so this module remains independent of Electron.
function createExcelBackupRetention({ writeLog = async () => {} } = {}) {
function compareYearMonth(yearA, monthA, yearB, monthB) {
  return Number(`${yearA}${monthA}`) - Number(`${yearB}${monthB}`);
}

async function keepOnlyLastBackupInMonth(monthFolder) {
  let entries;
  try {
    entries = await fs.readdir(monthFolder, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.xlsx'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (files.length <= 1) return;
  const keep = files[files.length - 1];
  for (const fileName of files.slice(0, -1)) {
    await fs.rm(path.join(monthFolder, fileName), { force: true });
  }
  await writeLog('INFO', 'EXCEL_BACKUP_MONTH_COMPACTED', {
    monthFolder,
    keptFile: keep,
    removedCount: files.length - 1
  });
}

async function compactCompletedBackupMonths(processBackupRoot, currentYear, currentMonth) {
  let yearEntries;
  try {
    yearEntries = await fs.readdir(processBackupRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const yearEntry of yearEntries) {
    if (!yearEntry.isDirectory() || !/^\d{4}$/.test(yearEntry.name)) continue;
    const yearFolder = path.join(processBackupRoot, yearEntry.name);
    const monthEntries = await fs.readdir(yearFolder, { withFileTypes: true }).catch(() => []);
    for (const monthEntry of monthEntries) {
      if (!monthEntry.isDirectory() || !/^\d{2}$/.test(monthEntry.name)) continue;
      if (compareYearMonth(yearEntry.name, monthEntry.name, currentYear, currentMonth) < 0) {
        await keepOnlyLastBackupInMonth(path.join(yearFolder, monthEntry.name));
      }
    }
  }
}


function backupDateFromName(fileName) {
  const match = String(fileName || '').match(/_(\d{4})-(\d{2})-(\d{2})\.xlsx$/i);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function backupDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function backupMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}
function backupWeekKey(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  return backupDayKey(copy);
}

async function pruneExcelBackupRetention(processBackupRoot, policy = { daily: 14, weekly: 8, monthly: 12 }) {
  const files = [];
  const walk = async (folder) => {
    let entries = [];
    try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const date = backupDateFromName(entry.name);
        if (date) files.push({ full, name: entry.name, date });
      }
    }
  };
  await walk(processBackupRoot);
  files.sort((a,b) => b.date - a.date || b.name.localeCompare(a.name));
  const keep = new Set();
  const keepBy = (keyFn, limit) => {
    const seen = new Set();
    for (const item of files) {
      const key = keyFn(item.date);
      if (seen.has(key) || seen.size >= limit) continue;
      seen.add(key); keep.add(item.full);
    }
  };
  keepBy(backupDayKey, policy.daily);
  keepBy(backupWeekKey, policy.weekly);
  keepBy(backupMonthKey, policy.monthly);
  let removed = 0;
  for (const item of files) {
    if (keep.has(item.full)) continue;
    await fs.rm(item.full, { force: true });
    removed += 1;
  }
  if (removed) await writeLog('INFO', 'EXCEL_BACKUP_RETENTION_PRUNED', { processBackupRoot, removed, policy });
}


  return { compactCompletedBackupMonths, pruneExcelBackupRetention };
}

module.exports = { createExcelBackupRetention };
