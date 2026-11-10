const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/ApprovedReportsDesktopActions.tsx'), 'utf8');

test('Excel actions remain adjacent to approved reports without detached footer portal', () => {
  assert.match(source, /className="ktc-desktop-excel-actions"/);
  assert.match(source, /<ApprovedReports \/>/);
  assert.match(source, /if \(!canExport\) return <ApprovedReports \/>/);
  assert.match(source, /if \(!window\.ktcDesktop\?\.isDesktop\)/);
  assert.doesNotMatch(source, /createPortal\(/);
  assert.doesNotMatch(source, /\.pending-table-footer/);
});
