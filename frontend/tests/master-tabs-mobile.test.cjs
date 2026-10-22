const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("master-data tab bar scrolls inside itself instead of widening the page on a 390px phone", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src/pages/admin/LeadManagerMasterData.tsx"), "utf8");
  const rule = src.match(/\.ktc-manager-master-tabs\{[^}]*\}/);
  assert.ok(rule, "tab bar rule exists");
  assert.match(rule[0], /max-width:100%/);
  assert.match(rule[0], /overflow-x:auto/);
});
