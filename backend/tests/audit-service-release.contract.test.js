const fs = require("fs");
const path = require("path");
const assert = require("assert");

const source = fs.readFileSync(
  path.join(__dirname, "..", "services", "auditService.js"),
  "utf8",
);

assert.match(source, /const query = async \(executor, sql, params = \[\]\)/);
assert.match(source, /executor\.promise\(\)\.query\(sql, params\)/);
// query() must unwrap the full mysql2 [rows|header, fields] tuple whenever a
// 2-element array comes back, not only when result[0] happens to be an array.
// Narrowing this to the rows-only (SELECT) shape previously meant INSERT/UPDATE
// results (a plain ResultSetHeader, never an array) were never unwrapped, so
// callers reading result.insertId silently got undefined instead of a real id.
assert.match(source, /Array\.isArray\(result\) && result\.length === 2\s*\n?\s*\?\s*result\[0\]/);
assert.doesNotMatch(source, /Array\.isArray\(result\[0\]\)\s*\n?\s*\?\s*result\[0\]/);
assert.match(source, /ER_DUP_ENTRY/);
assert.match(source, /key === '_buf'/);
assert.match(source, /toPlainValue/);
// report_versions.id is an unrelated global AUTO_INCREMENT PK; version_no is
// scoped per (report_type, report_id). createReportVersion must use
// LAST_INSERT_ID(expr) to make result.insertId return the computed version_no
// itself, in the same single INSERT...SELECT subrequest — not the row's PK, and
// not a second round trip. This is what makes restore-to-version and "undo a
// restore" (restoring back to the pre-restore version) address the right row.
assert.match(source, /LAST_INSERT_ID\(COALESCE\(MAX\(version_no\), 0\) \+ 1\)/);
assert.match(source, /if \(!Number\.isInteger\(versionNo\) \|\| versionNo <= 0\)/);
// loadTempReportSnapshot locks the temp-report row for the caller's transaction
// so a concurrent write cannot interleave with this snapshot read.
assert.match(source, /loadTempReportSnapshot/);
assert.match(source, /SELECT \* FROM production_reports_temp WHERE id=\? LIMIT 1 FOR UPDATE/);

console.log("PASS audit-service-release.contract");
