const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

const timeUi = fs.readFileSync(
  path.join(root, "frontend/src/pages/worker/components/ProcessTimeDeductionSection.tsx"),
  "utf8"
);
const timeLogic = fs.readFileSync(
  path.join(root, "frontend/src/pages/worker/processDeductionLogic.ts"),
  "utf8"
);
const validation = fs.readFileSync(
  path.join(root, "frontend/src/pages/worker/ProcessPage.tsx"),
  "utf8"
);

// Worker time UI
assert.match(timeUi, /actualTime/);
assert.match(timeUi, /deductionTime/);
assert.match(timeUi, /totalTime/);
assert.match(timeUi, /data-worker-time-part="actual-minutes"/);
assert.match(timeUi, /data-worker-time-value="deduction"/);
assert.match(timeUi, /data-worker-time-value="total"/);

// Time calculation contract
assert.match(timeUi, /const actualTime = hours \+ minutes \/ 60/);
assert.match(
  timeUi,
  /totalTime: String\(actualTime \+ \(Number\.isFinite\(deductionTime\) \? deductionTime : 0\)\)/
);

// Central deduction calculation
assert.match(timeLogic, /actualTime:\s*actualMinutesTotal\s*\/\s*60/);
assert.match(
  timeLogic,
  /totalTime:\s*\(actualMinutesTotal \+ deduction\)\s*\/\s*60/
);

// 12-hour business rule
assert.match(
  validation,
  /actualMinutes \+ deductionMinutes > MAX_TOTAL_WORK_MINUTES/
);
assert.match(
  validation,
  /parseFlexibleTime\(form\.totalTime\) > 12/
);

// Deduction UI must remain interactive
assert.match(timeUi, /onToggleDeduction/);
assert.match(timeUi, /onUpdateDeduction/);
assert.match(timeUi, /onNormalizeDeduction/);
assert.match(timeUi, /setShowDeduction/);

console.log("worker UI/time/click contract: PASS");
