const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

for (const file of ['frontend/src/pages/manager/Reports.tsx', 'frontend/src/pages/manager/ApprovedReports.tsx']) {
  test(`${file} ignores stale list responses after filter changes`, () => {
    const source = read(file);
    assert.match(source, /reportLoadSeqRef = useRef\(0\)/);
    assert.match(source, /const requestSeq = \+\+reportLoadSeqRef\.current/);
    assert.match(source, /const isCurrentRequest = \(\) => reportLoadSeqRef\.current === requestSeq/);
    assert.match(source, /if \(!isCurrentRequest\(\)\) return/);
  });
}
