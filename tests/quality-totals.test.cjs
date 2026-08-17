const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const quality = fs.readFileSync(path.join(__dirname, "../src/pages/worker/processQualityLogic.ts"), "utf8");
assert.match(quality, /calculateNgTotal/);
assert.match(quality, /applyNgToggleToForm/);
assert.match(quality, /next\.ttNg=String\(calculateNgTotal\(next, options\)\)/);
assert.match(quality, /next\.actualOutput=String\(calc\(next\)\)/);
assert.doesNotMatch(
  quality,
  /next\.ttNg=String\(calc\(next\)\)/
);
assert.doesNotMatch(
  quality,
  /next\.ttNg=String\(calc\(next\)\);\s*next\.actualOutput/
);
console.log("quality totals contract: PASS");
