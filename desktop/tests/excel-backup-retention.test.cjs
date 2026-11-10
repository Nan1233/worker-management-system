"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createExcelBackupRetention } = require("../electron/excelBackupRetention.cjs");

async function withTempDir(task) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ktc-backups-"));
  try { await task(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test("completed months compact to last named workbook and current month stays untouched", async () => {
  await withTempDir(async (dir) => {
    const previous = path.join(dir, "2026", "10");
    const current = path.join(dir, "2026", "11");
    await fs.mkdir(previous, { recursive: true });
    await fs.mkdir(current, { recursive: true });
    for (const file of ["a.xlsx", "b.xlsx"]) {
      await fs.writeFile(path.join(previous, file), file);
      await fs.writeFile(path.join(current, file), file);
    }
    const events = [];
    const { compactCompletedBackupMonths } = createExcelBackupRetention({ writeLog: async (...args) => events.push(args) });
    await compactCompletedBackupMonths(dir, "2026", "11");
    assert.deepEqual(await fs.readdir(previous), ["b.xlsx"]);
    assert.deepEqual((await fs.readdir(current)).sort(), ["a.xlsx", "b.xlsx"]);
    assert.equal(events[0][1], "EXCEL_BACKUP_MONTH_COMPACTED");
  });
});

test("retention keeps the newest date when daily policy is one and other limits are zero", async () => {
  await withTempDir(async (dir) => {
    const older = "backup_2026-10-01.xlsx";
    const newer = "backup_2026-10-02.xlsx";
    await fs.writeFile(path.join(dir, older), "old");
    await fs.writeFile(path.join(dir, newer), "new");
    const { pruneExcelBackupRetention } = createExcelBackupRetention();
    await pruneExcelBackupRetention(dir, { daily: 1, weekly: 0, monthly: 0 });
    assert.deepEqual(await fs.readdir(dir), [newer]);
  });
});
