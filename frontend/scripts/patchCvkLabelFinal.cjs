const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../src/pages/worker/components/ProcessBasicInfoSection.tsx');
let source = fs.readFileSync(file, 'utf8');

// All CVK patches must converge to exactly one operation button with this label.
// Older patches can leave a second CVK button or concatenate labels. Remove
// duplicate CVK buttons, then ensure the remaining button has the canonical text.
const cvkButton = /<button\s+type="button"\s+className=\{(?:[^{}]|\{[^{}]*\})*\}\s+onClick=\{[^}]*handleOperationTypeChange\("CVK"\)[^}]*\}>[\s\S]*?<\/button>/g;
const matches = source.match(cvkButton) || [];
if (matches.length > 1) {
  source = source.replace(cvkButton, (match, index) => index === 0 ? match : '');
}

// Normalize any accidental adjacent text duplication inside the CVK button.
source = source.replace(/(handleOperationTypeChange\("CVK"\)[^>]*>)Công việc khác(?:Công việc khác)+(<\/button>)/g, '$1Công việc khác$2');

// If the CVK button exists but its visible label was altered by an earlier
// patch, force only its text node to the canonical label.
source = source.replace(/(handleOperationTypeChange\("CVK"\)[^>]*>)[\s\S]*?(<\/button>)/g, '$1Công việc khác$2');

fs.writeFileSync(file, source, 'utf8');
console.log('[KTC] CVK final label normalization applied: exactly "Công việc khác".');
