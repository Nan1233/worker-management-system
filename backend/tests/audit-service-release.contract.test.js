const fs = require("fs");
const path = require("path");
const assert = require("assert");

const source = fs.readFileSync(
  path.join(__dirname, "..", "services", "auditService.js"),
  "utf8",
);

assert.match(source, /const query = async \(executor, sql, params = \[\]\)/);
assert.match(source, /executor\.promise\(\)\.query\(sql, params\)/);
assert.match(source, /result\.length === 2 && Array\.isArray\(result\[0\]\)/);
assert.match(source, /ER_DUP_ENTRY/);
assert.match(source, /key === '_buf'/);
assert.match(source, /toPlainValue/);
assert.match(source, /LIMIT 1\s+FOR UPDATE/);
assert.match(source, /ORDER BY version_no DESC/);
assert.match(source, /loadTempReportSnapshot/);

console.log("PASS audit-service-release.contract");
