const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src/styles/worker-final-ui.css"), "utf8");
const hardening = fs.readFileSync(path.join(root, "src/styles/interaction-hardening.css"), "utf8");
const timeUi = fs.readFileSync(path.join(root, "src/pages/worker/components/ProcessTimeDeductionSection.tsx"), "utf8");
const timeLogic = fs.readFileSync(path.join(root, "src/pages/worker/processDeductionLogic.ts"), "utf8");
const validation = fs.readFileSync(path.join(root, "src/pages/worker/ProcessPage.tsx"), "utf8");

assert.match(css, /\.single-machine-product-scope[\s\S]*grid-template-columns:\s*minmax\(0,\s*0\.78fr\)\s+minmax\(0,\s*1\.45fr\)/);
assert.match(css, /\.single-machine-product-scope[\s\S]*width:\s*100%/);
assert.match(hardening, /#root \.toast-container,[\s\S]*pointer-events:\s*none !important/);
assert.match(hardening, /#root \.ktc-toast-container > \.toast\s*\{[\s\S]*pointer-events:\s*auto !important/);
assert.match(timeUi, /Thời gian làm việc thực tế/);
assert.match(timeUi, /label>Thời gian trừ/);
assert.match(timeUi, /label>Tổng thời gian/);
assert.match(timeLogic, /actualTime:\s*actualMinutesTotal\s*\/\s*60/);
assert.match(timeLogic, /totalTime:\s*\(actualMinutesTotal \+ deduction\)\s*\/\s*60/);
assert.match(validation, /actualMinutes \+ deductionMinutes > MAX_TOTAL_WORK_MINUTES/);
console.log("worker UI/time/click contract: PASS");
