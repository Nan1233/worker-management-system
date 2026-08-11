const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("iOS profile delivery route uses Apple's configuration-profile MIME type", () => {
  const source = fs.readFileSync(path.join(root, "routes", "mobileRoutes.js"), "utf8");
  assert.match(source, /application\/x-apple-aspen-config/);
  assert.match(source, /router\.get\("\/ios-profile"/);
  assert.doesNotMatch(source, /setHeader\(["']Content-Disposition["'][^\n]*attachment/i);
});

test("bundled iOS Web Clip profile targets KTC and contains an embedded icon", () => {
  const profilePath = path.join(root, "mobile", "ios", "KTC-Production-Control.mobileconfig");
  const profile = fs.readFileSync(profilePath, "utf8");
  assert.match(profile, /com\.apple\.webClip\.managed/);
  assert.match(profile, /worker-management-system-3-dzox\.onrender\.com/);
  assert.match(profile, /<key>Icon<\/key>/);
  assert.match(profile, /<key>FullScreen<\/key>/);
});
