const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const quality = fs.readFileSync(
  path.join(__dirname, "../src/pages/worker/processQualityLogic.ts"),
  "utf8"
);

assert.match(quality, /calculateNgTotal/);
assert.match(quality, /next\.ttNg\s*=\s*String\(calculateNgTotal\(next,\s*options\)\)/);
assert.match(quality, /TT NG|calculateNgTotal/);
assert.doesNotMatch(
  quality,
  /Number\(form\.ttNg \|\| 0\).*sum/
);

console.log("quality totals contract: PASS");
