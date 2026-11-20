'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeManagerReportFilters, managerReportCacheKey } = require('../controllers/managerReportListUtils');

test('pending filters retain all legacy values and property order in the cache key', () => {
    const query = {
        date: '2026-11-19', date_from: '2026-11-01', date_to: '2026-11-30',
        shift: 'A', process_id: '6', process_name: '  Xử lý bavia  ',
        search: '  nhân viên  ', include_meta: '0', page: '2', page_size: '25'
    };
    const filters = normalizeManagerReportFilters(query, true);
    assert.deepEqual(filters, {
        date: '2026-11-19',
        date_from: '2026-11-01',
        date_to: '2026-11-30',
        shift: 'A',
        process_id: 6,
        process_name: 'Xử lý bavia',
        search: 'nhân viên',
        include_meta: false,
        pagination: { page: 2, pageSize: 25, offset: 25 }
    });
    assert.equal(query.process_name, '  Xử lý bavia  ', 'normalization must not mutate the query');
    assert.equal(managerReportCacheKey('pending', 'lead', 17, filters),
        `manager:pending:lead:17:${JSON.stringify(filters)}`);
});

test('approved filters preserve their separate cache namespace and exclude pending metadata', () => {
    const query = { process_id: '1', include_meta: '0', page: '1' };
    const pending = normalizeManagerReportFilters(query, true);
    const approved = normalizeManagerReportFilters(query, false);
    assert.equal(pending.include_meta, false);
    assert.equal(Object.hasOwn(approved, 'include_meta'), false);
    assert.deepEqual(approved.pagination, { page: 1, pageSize: 20, offset: 0 });
    const pendingKey = managerReportCacheKey('pending', 'manager', 9, pending);
    const approvedKey = managerReportCacheKey('approved', 'manager', 9, approved);
    assert.notEqual(pendingKey, approvedKey);
    assert.notEqual(approvedKey, managerReportCacheKey('approved', 'admin', 9, approved));
    assert.notEqual(approvedKey, managerReportCacheKey('approved', 'manager', 10, approved));
});

test('search and pagination validation retain original failure behavior', () => {
    assert.equal(normalizeManagerReportFilters({}, true).include_meta, true);
    assert.equal(normalizeManagerReportFilters({}, false).search, null);
    assert.throws(() => normalizeManagerReportFilters({ page: '0' }, true),
        error => error.code === 'PAGINATION_INVALID' && error.status === 400);
    assert.throws(() => normalizeManagerReportFilters({ search: 'x'.repeat(121) }, false),
        error => error.code === 'SEARCH_TOO_LONG' && error.status === 400);
});
