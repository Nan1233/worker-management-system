const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const quality = fs.readFileSync(
  path.join(__dirname, "../src/pages/worker/processQualityLogic.ts"),
  "utf8"
);

assert.match(quality, /calculateNgTotal/);
assert.match(quality, /next\.ttNg=String\(calculateNgTotal\(next, options\)\)/);
assert.match(quality, /TT NG tuyệt đối không lấy TT OK/);
assert.doesNotMatch(
  quality,
  /Number\(form\.ttNg \|\| 0\).*sum/
);

console.log("quality totals contract: PASS");
