const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const helperPath = path.resolve(__dirname, "../src/pages/worker/workerHomeStats.ts");
const source = fs.readFileSync(helperPath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = new Module(helperPath, module);
loaded.filename = helperPath;
loaded.paths = Module._nodeModulePaths(path.dirname(helperPath));
loaded._compile(compiled, helperPath);
const { calculateWorkerHomeTodayStats } = loaded.exports;

test("worker home totals include every today report, not just the four displayed rows", () => {
  const reports = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    tt_ok: 10,
    defects: [{ quantity: 2 }],
  }));

  const stats = calculateWorkerHomeTodayStats(reports, () => 1.5);

  assert.deepEqual(stats, { ok: 60, ng: 12, time: 9, reportCount: 6 });
});

test("worker home totals handle empty reports and missing quantities", () => {
  assert.deepEqual(calculateWorkerHomeTodayStats([], () => 0), {
    ok: 0,
    ng: 0,
    time: 0,
    reportCount: 0,
  });
  assert.deepEqual(calculateWorkerHomeTodayStats([
    { tt_ok: undefined, defects: [{ quantity: undefined }] },
  ], () => 0), { ok: 0, ng: 0, time: 0, reportCount: 1 });
});

test("worker home limits only the visible list, not the daily aggregation input", () => {
  const component = fs.readFileSync(
    path.resolve(__dirname, "../src/pages/worker/WorkerHome.tsx"),
    "utf8",
  );
  assert.match(component, /todayReports\.length \? todayReports\.slice\(0, 4\) : reports\.slice\(0, 4\)/);
  assert.match(component, /calculateWorkerHomeTodayStats\(todayReports, getReportActualHours\)/);
  assert.doesNotMatch(component, /\.sort\(\(a, b\) => String\(b\.entry_date \|\| b\.work_date\)\.localeCompare\(String\(a\.entry_date \|\| a\.work_date\)\)\)\s*\.slice\(0, 4\)/);
});
