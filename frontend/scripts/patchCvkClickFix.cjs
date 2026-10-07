const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'src/pages/worker/ProcessPage.tsx');
const configPath = path.join(root, 'src/pages/worker/processPageConfig.ts');
const qualityPath = path.join(root, 'src/pages/worker/components/ProcessQualitySection.tsx');
const submissionPath = path.join(root, 'src/pages/worker/processReportSubmission.ts');

let page = fs.readFileSync(pagePath, 'utf8');
let config = fs.readFileSync(configPath, 'utf8');
let quality = fs.readFileSync(qualityPath, 'utf8');
let submission = fs.readFileSync(submissionPath, 'utf8');

// IMPORTANT: CVK UI is owned by patchCvkWorkerEntryV3.cjs.
// Do not patch ProcessBasicInfoSection here. The previous version of this
// script also injected a second CVK button/state into that component, which
// could produce the rendered label "Công việc khácCông việc khác".
// Keep this script responsible only for submit validation/data mapping.

// CVK validation: use the selected non-product work type as the selection
// instead of productName.
const guard = 'const cvkWorkType = String(form.workType || "").trim().toUpperCase();\n        const isCvkEntry = ["CVK", "XUATNHAP", "KTCD", "TAIPP"].includes(cvkWorkType);';
if (!page.includes('const isCvkEntry = ["CVK", "XUATNHAP", "KTCD", "TAIPP"].includes(cvkWorkType);')) {
  const inserted = page.replace(/(const validateForm = \(\): string => \{)/, `$1\n        ${guard}`);
  if (inserted === page) throw new Error('[KTC] CVK patch failed: validateForm anchor not found');
  page = inserted;
}

// CVK has no product or production standard.
page = page.replace(
  /if \(!usesMultiMachineLines\) \{\s*if \(!form\.productName\.trim\(\)\) \{\s*return "Vui lòng chọn sản phẩm";\s*\}/g,
  'if (!isCvkEntry && !usesMultiMachineLines) {\n            if (!form.productName.trim()) {\n                return "Vui lòng chọn sản phẩm";\n            }'
);
page = page.replace(
  /if \(!usesMultiMachineLines\) \{\s*if \(Number\(form\.standardOutput \|\| 0\) <= 0\) \{\s*return "Định mức phải lớn hơn 0";\s*\}/g,
  'if (!isCvkEntry && !usesMultiMachineLines) {\n            if (Number(form.standardOutput || 0) <= 0) {\n                return "Định mức phải lớn hơn 0";\n            }'
);

// CVK does not use quality/output validation.
page = page.replace(/if \(Number\(form\.actualOutput \|\| 0\) < 0\)/g, 'if (!isCvkEntry && Number(form.actualOutput || 0) < 0)');
page = page.replace(/if \(Number\(form\.ttOk \|\| 0\) < 0\)/g, 'if (!isCvkEntry && Number(form.ttOk || 0) < 0)');
page = page.replace(/if \(Number\(form\.ttNg \|\| 0\) < 0\)/g, 'if (!isCvkEntry && Number(form.ttNg || 0) < 0)');

// CVK is accepted as a non-product work entry by the quality helper as well.
quality = quality.replace(
  /new Set\(\["XUATNHAP", "KTCD", "TAIPP"\]\)/g,
  'new Set(["CVK", "XUATNHAP", "KTCD", "TAIPP"])'
);

// CVK reports are stored under process_id 30002. Keep this mapping in the
// submission builder so the backend receives the canonical CVK process.
if (!submission.includes('const effectiveProcessId = isCvk ? 30002 : args.processId;')) {
  submission = submission.replace(
    /const isCvk = [^;]+;/,
    'const isCvk = Number(args.processId) === 30002 || Number(args.processId) === 60006 || String(args.extraData?.process_code || args.extraData?.processCode || "").trim().toUpperCase() === "CVK" || ["CVK", "XUATNHAP", "KTCD", "TAIPP"].includes(cvkWorkType.toUpperCase());\n  const effectiveProcessId = isCvk ? 30002 : args.processId;'
  );
}
submission = submission.replace(/process_id:\s*args\.processId/g, 'process_id: effectiveProcessId');

// Fail the build instead of deploying if the product-required guard was not
// actually removed from the CVK-aware validator.
if (!page.includes('const isCvkEntry = ["CVK", "XUATNHAP", "KTCD", "TAIPP"].includes(cvkWorkType);')) {
  throw new Error('[KTC] CVK patch failed: isCvkEntry was not inserted');
}
if (/if \(!usesMultiMachineLines\) \{\s*if \(!form\.productName\.trim\(\)\) \{\s*return "Vui lòng chọn sản phẩm";/.test(page)) {
  throw new Error('[KTC] CVK patch failed: old product-required validation is still present');
}

fs.writeFileSync(configPath, config);
fs.writeFileSync(pagePath, page);
fs.writeFileSync(qualityPath, quality);
fs.writeFileSync(submissionPath, submission);
console.log('[KTC] CVK click fix: validation/data mapping only; BasicInfo UI left to CVK V3 patch.');
