const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/Reports.tsx'), 'utf8');

test('bulk approval closes only its own still-current report detail', () => {
  assert.match(source, /const approvedIds = targets\.map\(report => Number\(report\.id\)\)/);
  assert.match(source, /detailRequestSeqRef\.current === detailRequestSeq && approvedIds\.includes\(Number\(detail\.id\)\) && !failedIds\.includes\(Number\(detail\.id\)\)\) closeDetail\(\)/);
});
test('bulk rejection closes only a successfully rejected still-current report detail', () => {
  assert.match(source, /const rejectedIds = \[\.\.\.rejectTargetIds\]/);
  assert.match(source, /detailRequestSeqRef\.current === detailRequestSeq && rejectedIds\.includes\(Number\(detail\.id\)\) && !failedIds\.includes\(Number\(detail\.id\)\)\) closeDetail\(\)/);
});
