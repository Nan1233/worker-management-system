const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/Reports.tsx'), 'utf8');

test('failed pending refresh keeps last successful page and filter options', () => {
  const load = src.slice(src.indexOf('const load = useCallback'), src.indexOf('const filterKey ='));
  const errorHandler = load.slice(load.indexOf('} catch (e: any)'));
  assert.match(errorHandler, /if \(!isCurrentRequest\(\)\) return/);
  assert.match(errorHandler, /setError\(e\?\.response\?\.data\?\.message/);
  assert.doesNotMatch(errorHandler, /setReports\(\[\]\)/);
  assert.doesNotMatch(errorHandler, /setProcessOptions\(\[\]\)/);
  assert.doesNotMatch(errorHandler, /setTotal\(0\)/);
  assert.doesNotMatch(errorHandler, /setPages\(1\)/);
});
