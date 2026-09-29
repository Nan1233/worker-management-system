const fs = require('fs');
const path = require('path');

const qualityPath = path.resolve(__dirname, '../src/pages/worker/components/ProcessQualitySection.tsx');
let quality = fs.readFileSync(qualityPath, 'utf8');
let qualityChanged = false;

if (!quality.includes('hideForCvk?: boolean;')) {
  quality = quality.replace(
    'usesMultiMachineLines: boolean; qualityLocked?: boolean; formatIntegerDisplay:',
    'usesMultiMachineLines: boolean; qualityLocked?: boolean; hideForCvk?: boolean; formatIntegerDisplay:'
  );
  qualityChanged = true;
}

if (!quality.includes('hideForCvk, formatIntegerDisplay')) {
  quality = quality.replace(
    'usesMultiMachineLines, qualityLocked: qualityLockedProp, formatIntegerDisplay, onTtOkChange',
    'usesMultiMachineLines, qualityLocked: qualityLockedProp, hideForCvk, formatIntegerDisplay, onTtOkChange'
  );
  qualityChanged = true;
}

if (!quality.includes('if (hideForCvk) return null;')) {
  quality = quality.replace(
    'export default function ProcessQualitySection({ form,',
    'export default function ProcessQualitySection({ form,'
  );
  const fnMarker = '    // CVK là công việc không có định mức: không có SL OK/NG/TT và không có chi tiết NG.\n';
  if (quality.includes(fnMarker)) {
    quality = quality.replace(fnMarker, '    // CVK không có báo cáo chất lượng, kể cả trước khi chọn công việc.\n    if (hideForCvk) return null;\n' + fnMarker);
    qualityChanged = true;
  }
}

if (qualityChanged) fs.writeFileSync(qualityPath, quality, 'utf8');

const pagePath = path.resolve(__dirname, '../src/pages/worker/ProcessPage.tsx');
let page = fs.readFileSync(pagePath, 'utf8');
let pageChanged = false;
const qStart = page.indexOf('<ProcessQualitySection');
if (qStart >= 0) {
  const formPos = page.indexOf('form={form}', qStart);
  const qEnd = page.indexOf('/>', qStart);
  if (formPos >= 0 && (qEnd < 0 || formPos < qEnd) && !page.slice(qStart, formPos).includes('hideForCvk=')) {
    page = page.slice(0, formPos) + 'hideForCvk={cvkMode}\n                    ' + page.slice(formPos);
    pageChanged = true;
  }
}
if (pageChanged) fs.writeFileSync(pagePath, page, 'utf8');

console.log('[KTC] CVK quality section hidden immediately on CVK mode.');
