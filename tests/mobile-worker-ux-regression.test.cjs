const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("mobile worker nav contains four primary destinations and no logout item", () => {
  const s = read("frontend/src/layouts/WorkerLayout.tsx");
  assert.match(s, /const menuItems:[\s\S]*Nhập báo cáo[\s\S]*Lịch sử[\s\S]*Thông báo[\s\S]*Tài khoản/);
  const mobileNav = s.split('className="worker-mobile-nav"')[1] || "";
  assert.doesNotMatch(mobileNav, /className="logout"/);
});

test("worker accepts any Internet path and does not gate on company IP", () => {
  const s = read("frontend/src/pages/worker/ProcessPage.tsx");
  assert.doesNotMatch(s, /getCompanyNetworkAccess|networkAllowed|networkChecking/);
  assert.match(s, /if \(!navigator\.onLine\)/);
  assert.match(s, /enqueueOfflineReport\(payload\)/);
});
