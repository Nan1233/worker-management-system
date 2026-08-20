const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src/pages/worker/ProcessPage.css"), "utf8");
const toastCss = fs.readFileSync(path.join(root, "src/components/feedback/toast.css"), "utf8");
const timeUi = fs.readFileSync(path.join(root, "src/pages/worker/components/ProcessTimeDeductionSection.tsx"), "utf8");
const timeLogic = fs.readFileSync(path.join(root, "src/pages/worker/processDeductionLogic.ts"), "utf8");
const validation = fs.readFileSync(path.join(root, "src/pages/worker/ProcessPage.tsx"), "utf8");

assert.match(css, /\.single-machine-product-scope,[\s\S]*grid-column:\s*1\s*\/\s*-1/);
assert.match(toastCss, /\.ktc-toast-container\s*\{[\s\S]*pointer-events:\s*none\s*!important/);
assert.match(toastCss, /\.ktc-toast-container\s*>\s*\.ktc-toast\s*\{[\s\S]*pointer-events:\s*auto/);
assert.match(timeUi, /Thời gian làm việc thực tế/);
assert.match(timeUi, /label>Thời gian trừ/);
assert.match(timeUi, /label>Tổng thời gian/);
assert.match(timeLogic, /actualTime:\s*actualMinutesTotal\s*\/\s*60/);
assert.match(timeLogic, /totalTime:\s*\(actualMinutesTotal \+ deduction\)\s*\/\s*60/);
assert.match(validation, /actualMinutes \+ deductionMinutes > MAX_TOTAL_WORK_MINUTES/);
console.log("worker UI/time/click contract: PASS");
