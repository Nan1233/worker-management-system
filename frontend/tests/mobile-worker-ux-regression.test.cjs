const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("mobile worker nav contains four primary destinations and no logout item", () => {
  const s = read("src/layouts/WorkerLayout.tsx");
  assert.match(s, /const menuItems:[\s\S]*Nhập báo cáo[\s\S]*Lịch sử[\s\S]*Thông báo[\s\S]*Tài khoản/);
  const mobileNav = s.split('className="worker-mobile-nav"')[1] || "";
  assert.doesNotMatch(mobileNav, /className="logout"/);
});

test("worker network gate bypasses cached IP decision and rechecks on app return", () => {
  const s = read("src/pages/worker/ProcessPage.tsx");
  assert.match(s, /getCompanyNetworkAccess\(true\)/);
  assert.match(s, /addEventListener\("online"/);
  assert.match(s, /addEventListener\("focus"/);
  assert.match(s, /visibilitychange/);
});
