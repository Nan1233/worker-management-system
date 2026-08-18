const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const quality = fs.readFileSync(path.join(__dirname, "../frontend/src/pages/worker/processQualityLogic.ts"), "utf8");
assert.match(quality, /calculateNgTotal/);
assert.match(quality, /applyNgToggleToForm/);
assert.match(quality, /next\.ttNg\s*=\s*String\(calculateNgTotal\(next,\s*options\)\)/);
assert.match(quality, /next\.actualOutput\s*=\s*String\(calc\(next\)\)/);
assert.doesNotMatch(
  quality,
  /next\.ttNg=String\(calc\(next\)\)/
);
assert.doesNotMatch(
  quality,
  /next\.ttNg=String\(calc\(next\)\);\s*next\.actualOutput/
);
console.log("quality totals contract: PASS");
