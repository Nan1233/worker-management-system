\
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src/components/feedback/toast.css"), "utf8");
const provider = fs.readFileSync(path.join(root, "src/components/feedback/ToastProvider.tsx"), "utf8");
const sw = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");
const version = fs.readFileSync(path.join(root, "src/config/version.ts"), "utf8");

assert.match(provider, /className="ktc-toast-container"/);
assert.doesNotMatch(provider, /className="toast-container"/);
assert.match(css, /\.ktc-toast-container\s*\{[\s\S]*pointer-events:\s*none\s*!important;/);
assert.match(css, /\.ktc-toast-container\s*>\s*\.toast\s*\{[\s\S]*pointer-events:\s*auto;/);
assert.match(css, /inset:\s*20px\s+20px\s+auto\s+auto;/);
assert.match(css, /width:\s*min\(380px,\s*calc\(100vw\s*-\s*32px\)\);/);
assert.match(sw, /1\.8\.19-toast-click-fix-20260817/);
assert.match(version, /1\.8\.19/);
assert.doesNotMatch(css, /\.toast-container\s*\{/);

console.log("toast click shield contract: PASS");
