// GC machine-line time input: Worker enters "Thời gian chạy thực tế" + "Thời gian trừ".
// There is no separate "Tổng thời gian" field for machine lines: the gross total
// (actual + deduction) is computed internally only to cap at 12h (MAX_TOTAL_WORK_MINUTES)
// and is never rendered to the Worker, unlike ProcessTimeDeductionSection.tsx.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const basic = fs.readFileSync(path.join(root, "src/pages/worker/components/ProcessBasicInfoSection.tsx"), "utf8");
const payload = fs.readFileSync(path.join(root, "src/pages/worker/processReportSubmission.ts"), "utf8");
const edit = fs.readFileSync(path.join(root, "src/pages/worker/WorkerReportEditV2.tsx"), "utf8");

test("machine line shows actual-time input and deduction input without rendering total-time UI", () => {
  assert.match(basic, /label>Thời gian chạy thực tế/);
  assert.match(basic, /label>Thời gian trừ/);
  assert.doesNotMatch(basic, /data-worker-time="machine-total"/);
  assert.doesNotMatch(basic, /data-worker-time-value="machine-total"/);
  assert.match(basic, /worker-time-grid machine-worker-time-grid/);
  assert.match(basic, /data-worker-time="machine-actual"/);
  assert.match(basic, /data-worker-time="machine-deduction"/);
  assert.match(basic, /machine-detail-values-row/);
  assert.match(basic, /Chi tiết trừ giờ/);
  assert.match(basic, /Chi tiết lỗi NG/);
  // No editable field should still be labelled as the old "Thời gian máy" (direct gross input).
  assert.doesNotMatch(basic, />Thời gian máy</);
});

test("machine actual-time/minutes handlers cap the total (actual + deduction) at 12 hours", () => {
  assert.match(basic, /const getMachineActualMinutes/);
  assert.match(basic, /const getMachineGrossMinutes[\s\S]*getMachineActualMinutes\(line\) \+ getMachineDeductionMinutes\(line\)/);
  assert.match(basic, /updateMachineActualHours/);
  assert.match(basic, /updateMachineActualMinutes/);
  assert.match(basic, /hours \* 60 \+ currentMinutes \+ deductionMinutes > MAX_TOTAL_WORK_MINUTES/);
});

test("submission payload sends actual_time_hours and derives machine_time_hours as actual + deduction, never a direct gross input", () => {
  assert.match(payload, /actual_time_hours:lineActualTimeHours, machine_time_hours:lineActualTimeHours\+lineDeductionHours/);
});

test("edit flow repopulates the actual-time field from stored gross minus deduction, not the raw stored total", () => {
  assert.match(edit, /actualTimeHours = Math\.max\(0, n\(line\.machine_time_hours\) - deductionTimeHours\)/);
  assert.match(edit, /const time = hm\(actualTimeHours\)/);
});
