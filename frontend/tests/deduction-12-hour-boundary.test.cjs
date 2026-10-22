const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

// P0 business rule (kept in sync with the backend daily-hours check in productionTempCreateModel /
// productionTempModel): the 12h/day cap counts ACTUAL working time only. Deduction/support time is excluded.
// Open decision recorded in the unification report: confirm "actual only" with the business owner.
test("deduction logic excludes deduction minutes from the 12-hour prospective total (actual time only)", () => {
  const source = fs.readFileSync("src/pages/worker/processDeductionLogic.ts", "utf8");
  assert.match(source, /return baseMinutes\(actualHours, actualMinutes\);/);
  assert.doesNotMatch(source, /return baseMinutes\(actualHours, actualMinutes\) \+ minutesOf\(data\)/);
});
