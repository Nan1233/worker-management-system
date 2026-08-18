const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('SOURCE_CONTRACT: manager list service sends bounded server pagination and filters', () => {
  const source = read('frontend/src/services/productionService.ts');
  assert.match(source, /page:\s*filters\.page \|\| 1/);
  assert.match(source, /page_size:\s*filters\.pageSize \|\| 20/);
  assert.match(source, /process_name:\s*filters\.processName/);
  assert.match(source, /search:\s*filters\.search\?\.trim\(\)/);
  assert.match(source, /shift:\s*filters\.shift/);
});

test('SOURCE_CONTRACT: pending page consumes server pagination and total count instead of client slice', () => {
  const source = read('frontend/src/pages/manager/Reports.tsx');
  assert.match(source, /setTotalCount\(result\.pagination\.total\)/);
  assert.match(source, /setTotalPages\(result\.pagination\.total_pages\)/);
  assert.match(source, /page:\s*currentPage/);
  assert.doesNotMatch(source, /filteredReports\.slice/);
});

test('SOURCE_CONTRACT: approved page consumes server pagination and total count instead of client slice', () => {
  const source = read('frontend/src/pages/manager/ApprovedReports.tsx');
  assert.match(source, /setTotalCount\(result\.pagination\.total\)/);
  assert.match(source, /setTotalPages\(result\.pagination\.total_pages\)/);
  assert.match(source, /page:\s*currentPage/);
  assert.doesNotMatch(source, /filteredReports\.slice/);
});

test('SOURCE_CONTRACT: filter/search changes reset page and clear stale selection', () => {
  for (const file of ['frontend/src/pages/manager/Reports.tsx', 'frontend/src/pages/manager/ApprovedReports.tsx']) {
    const source = read(file);
    assert.match(source, /setCurrentPage\(1\)/);
    assert.match(source, /setSelectedIds\(\[\]\)/);
    assert.match(source, /selectedShift, selectedProcess/);
  }
});

test('SOURCE_CONTRACT: stale page response fencing remains active', () => {
  for (const file of ['frontend/src/pages/manager/Reports.tsx', 'frontend/src/pages/manager/ApprovedReports.tsx']) {
    const source = read(file);
    assert.match(source, /const requestSeq = \+\+reportLoadSeqRef\.current/);
    assert.match(source, /if \(!isCurrentRequest\(\)\) return/);
  }
});

test('SOURCE_CONTRACT: approve/reject invalidate both manager list caches before reload', () => {
  const source = read('frontend/src/services/productionService.ts');
  assert.match(source, /clearSessionCache\("manager-pending"\)/);
  assert.match(source, /clearSessionCache\("manager-approved"\)/);
  assert.match(source, /approveSelectedTempReports[\s\S]*invalidateManagerReportCaches\(\)/);
  assert.match(source, /rejectSelectedTempReports[\s\S]*invalidateManagerReportCaches\(\)/);
});

test('SOURCE_CONTRACT: Excel export remains separate from paginated manager list API', () => {
  const approvedPage = read('frontend/src/pages/manager/ApprovedReports.tsx');
  const service = read('frontend/src/services/productionService.ts');
  assert.match(approvedPage, /exportSelectedApprovedExcel\(/);
  assert.match(service, /exportSelectedApprovedExcel/);
  assert.doesNotMatch(approvedPage, /getApprovedReports\([\s\S]{0,120}excelMonth/);
});

test('SOURCE_CONTRACT: search input is debounced before server request', () => {
  for (const file of ['frontend/src/pages/manager/Reports.tsx', 'frontend/src/pages/manager/ApprovedReports.tsx']) {
    const source = read(file);
    assert.match(source, /setTimeout\(\(\) => \{[\s\S]*setSearchQuery\(searchKeyword\.trim\(\)\)[\s\S]*\}, 250\)/);
    assert.match(source, /search:\s*searchQuery \|\| undefined/);
  }
});
