const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/ApprovedReportsDesktopActions.tsx'), 'utf8');

test('Excel portal follows the active footer and clears detached targets', () => {
  assert.match(source, /document\.querySelector<HTMLElement>\("\.pending-table-footer"\)/);
  assert.match(source, /setFooter\(current => current === element \? current : element\)/);
  assert.match(source, /observer\.observe\(document\.documentElement, \{ childList: true, subtree: true \}\)/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(source, /timers\.forEach\(window\.clearTimeout\)/);
  assert.match(source, /setFooter\(null\)/);
  assert.match(source, /if \(!footer\) return <ApprovedReports \/>/);
});
