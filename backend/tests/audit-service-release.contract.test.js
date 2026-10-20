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
// Atomic INSERT ... SELECT MAX(version_no)+1 replaces the old ordered read.
assert.match(source, /COALESCE\(MAX\(version_no\), 0\) \+ 1/);
assert.match(source, /loadTempReportSnapshot/);

console.log("PASS audit-service-release.contract");
