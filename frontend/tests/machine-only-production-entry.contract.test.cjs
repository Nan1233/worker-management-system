const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("machine mode hides worker-level OK/NG/total summary", () => {
  const quality = read("src/pages/worker/components/ProcessQualitySection.tsx");
  assert.match(quality, /operationMode !== "MACHINE"\s*&&\s*<div className="worker-quality-summary">/);
  assert.match(quality, /operationMode === "MACHINE" \? "Lỗi NG của máy" : "Báo cáo Chất lượng"/);
  assert.match(quality, /operationMode === "MACHINE" \? "Chi tiết lỗi NG của máy"/);
});

test("single-machine mode exposes OK/NG at machine level", () => {
  const basic = read("src/pages/worker/components/ProcessBasicInfoSection.tsx");
  assert.match(basic, /className="machine-section-title">Sản lượng máy/);
  assert.match(basic, /id="machineOkQuantity"/);
  assert.match(basic, /id="machineNgQuantity"[^>]*readOnly/);
  assert.match(basic, /actualOutput: String\(Math\.max\(0, Number\(value\) \|\| 0\) \+ Math\.max\(0, Number\(prev\.ttNg\) \|\| 0\)\)/);
});

test("create and edit forms both pass operation mode to quality section", () => {
  assert.match(read("src/pages/worker/ProcessPage.tsx"), /<ProcessQualitySection[\s\S]*?operationMode=\{operationMode\}/);
  assert.match(read("src/pages/worker/WorkerReportEditV2.tsx"), /<ProcessQualitySection[^>]*operationMode=\{operationMode\}/);
});
