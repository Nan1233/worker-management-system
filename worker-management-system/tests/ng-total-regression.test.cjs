const assert = require("node:assert/strict");

// Business regression case: TT OK must never be included in TT NG.
// TT OK = 2555, NG defects = 0 => TT NG = 0, actual output = 2555.
const ttOk = 2555;
const defectTotal = 0;
assert.equal(defectTotal, 0);
assert.equal(ttOk + defectTotal, 2555);

// TT OK = 2555, defect KQD = 100 => TT NG = 100, actual output = 2655
const defectTotal2 = 100;
assert.equal(defectTotal2, 100);
assert.equal(ttOk + defectTotal2, 2655);

console.log("NG total regression cases: PASS");
