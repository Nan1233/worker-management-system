const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("deduction logic includes deduction minutes in the 12-hour prospective total", () => {
  const source = fs.readFileSync("src/pages/worker/processDeductionLogic.ts", "utf8");
  assert.match(source, /return baseMinutes\(actualHours, actualMinutes\) \+ minutesOf\(data\)/);
});
