const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const pagination = require('../services/managerReportPaginationService');

function loadReadModel(fakeDb) {
  const dbPath = require.resolve('../config/db');
  const sharedPath = require.resolve('../models/productionTempModelShared');
  const readPath = require.resolve('../models/productionTempReadModel');
  delete require.cache[sharedPath];
  delete require.cache[readPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
  return require('../models/productionTempReadModel');
}

function createFakeDb() {
  const calls = [];
  const db = {
    calls,
    query(sql, params, callback) {
      calls.push({ sql: String(sql), params: [...(params || [])] });
      const text = String(sql);
      if (/FROM processes p/.test(text)) return callback(null, [
        { id: 1, process_name: 'Gia công' },
        { id: 2, process_name: 'Mài' }
      ]);
      if (/work_date < CURRENT_DATE/.test(text)) return callback(null, [{ total: 7 }]);
      if (/SELECT COUNT\(\*\) AS total/.test(text)) return callback(null, [{ total: 45 }]);
      if (/FROM production_reports_temp pr/.test(text) && /LIMIT \? OFFSET \?/.test(text)) {
        const pageSize = Number(params[params.length - 2]);
        const offset = Number(params[params.length - 1]);
        return callback(null, Array.from({ length: Math.min(pageSize, Math.max(0, 45 - offset)) }, (_, index) => ({
          id: offset + index + 1,
          worker_code: `W${offset + index + 1}`,
          process_name: 'Mài',
          updated_at: '2026-08-13T00:00:00.000Z'
        })));
      }
      if (/FROM production_reports pr/.test(text) && /LIMIT \? OFFSET \?/.test(text)) {
        const pageSize = Number(params[params.length - 2]);
        const offset = Number(params[params.length - 1]);
        return callback(null, Array.from({ length: Math.min(pageSize, Math.max(0, 45 - offset)) }, (_, index) => ({
          id: 1000 + offset + index + 1,
          worker_code: `W${offset + index + 1}`,
          process_name: 'Mài'
        })));
      }
      callback(null, []);
    }
  };
  return db;
}

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function loadManagementController(fakeModel) {
  const dbPath = require.resolve('../config/db');
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { query() {}, promise() { return { query: async () => [[]] }; } }
  };
  const modelPath = require.resolve('../models/productionTempModel');
  require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: fakeModel };
  const controllerPath = require.resolve('../controllers/productionTempManagementController');
  delete require.cache[controllerPath];
  return require('../controllers/productionTempManagementController');
}

test('BEHAVIORAL: pagination defaults are bounded', () => {
  assert.deepEqual(pagination.normalizePagination({}), { page: 1, pageSize: 20, offset: 0 });
});

test('BEHAVIORAL: page_size maximum is enforced', () => {
  assert.throws(() => pagination.normalizePagination({ page_size: 101 }), (error) => error.code === 'PAGE_SIZE_TOO_LARGE');
});

test('BEHAVIORAL: invalid page is rejected instead of producing negative offset', () => {
  assert.throws(() => pagination.normalizePagination({ page: -1 }), (error) => error.code === 'PAGINATION_INVALID');
  assert.throws(() => pagination.normalizePagination({ page: 'x' }), (error) => error.code === 'PAGINATION_INVALID');
});

test('BEHAVIORAL: bulk review maximum rejects oversized selection and accepts 100', () => {
  assert.equal(pagination.assertReviewBatchSize(Array.from({ length: 100 })), 100);
  assert.throws(() => pagination.assertReviewBatchSize(Array.from({ length: 101 })), (error) => error.code === 'REVIEW_BATCH_TOO_LARGE');
});

test('BEHAVIORAL: pending page 1/page 2 are deterministic and non-overlapping', async () => {
  const db = createFakeDb();
  const model = loadReadModel(db);
  const common = { date_from: '2026-08-01', date_to: '2026-08-31', pagination: { page_size: 20 } };
  const page1 = await model.getPending(7, { ...common, pagination: { page: 1, page_size: 20, offset: 0 } }, false);
  const page2 = await model.getPending(7, { ...common, pagination: { page: 2, page_size: 20, offset: 20 } }, false);
  assert.equal(page1.items.length, 20);
  assert.equal(page2.items.length, 20);
  assert.equal(page1.items.at(-1).id, 20);
  assert.equal(page2.items[0].id, 21);
  assert.equal(page1.pagination.total, 45);
  assert.equal(page1.pagination.total_pages, 3);
});

test('BEHAVIORAL: pending authorization and filters are applied before LIMIT/OFFSET', async () => {
  const db = createFakeDb();
  const model = loadReadModel(db);
  await model.getPending(77, {
    date_from: '2026-08-01', date_to: '2026-08-31', shift: 'A', process_name: 'Mài', search: 'W001',
    pagination: { page: 2, page_size: 20, offset: 20 }
  }, false);
  const dataCall = db.calls.find((call) => /FROM production_reports_temp pr/.test(call.sql) && /LIMIT \? OFFSET \?/.test(call.sql));
  assert.ok(dataCall);
  assert.match(dataCall.sql, /EXISTS \([\s\S]*manager_processes/);
  assert.match(dataCall.sql, /pr\.shift = \?/);
  assert.match(dataCall.sql, /p\.process_name = \?/);
  assert.match(dataCall.sql, /LIKE \?/);
  assert.ok(dataCall.sql.indexOf('WHERE') < dataCall.sql.indexOf('LIMIT ? OFFSET ?'));
  assert.deepEqual(dataCall.params.slice(-2), [20, 20]);
  assert.ok(dataCall.params.includes(77));
});

test('BEHAVIORAL: pending total count uses same scoped business filters without pagination', async () => {
  const db = createFakeDb();
  const model = loadReadModel(db);
  await model.getPending(19, {
    shift: 'B', process_name: 'Gia công', search: '599', pagination: { page: 1, page_size: 20, offset: 0 }
  }, false);
  const countCall = db.calls.find((call) => /SELECT COUNT\(\*\) AS total/.test(call.sql) && /JOIN workers/.test(call.sql));
  const dataCall = db.calls.find((call) => /FROM production_reports_temp pr/.test(call.sql) && /LIMIT \? OFFSET \?/.test(call.sql));
  assert.ok(countCall && dataCall);
  assert.doesNotMatch(countCall.sql, /LIMIT|OFFSET/);
  assert.deepEqual(countCall.params, dataCall.params.slice(0, -2));
});

test('BEHAVIORAL: pending ordering has id tie-breaker', async () => {
  const db = createFakeDb();
  const model = loadReadModel(db);
  await model.getPending(1, { pagination: { page: 1, page_size: 20, offset: 0 } }, true);
  const call = db.calls.find((entry) => /FROM production_reports_temp pr/.test(entry.sql) && /LIMIT \? OFFSET \?/.test(entry.sql));
  assert.match(call.sql, /ORDER BY pr\.work_date DESC, pr\.created_at ASC, pr\.id ASC/);
});

test('BEHAVIORAL: approved pagination returns bounded page and deterministic order', async () => {
  const db = createFakeDb();
  const model = loadReadModel(db);
  const result = await model.getApproved(8, { pagination: { page: 3, page_size: 20, offset: 40 } }, false);
  assert.equal(result.items.length, 5);
  assert.equal(result.items[0].id, 1041);
  assert.equal(result.pagination.total, 45);
  const call = db.calls.find((entry) => /FROM production_reports pr/.test(entry.sql) && /LIMIT \? OFFSET \?/.test(entry.sql));
  assert.match(call.sql, /ORDER BY pr\.approved_at DESC, pr\.id DESC/);
});

test('BEHAVIORAL: admin list query retains global access while manager query is scoped', async () => {
  const adminDb = createFakeDb();
  const adminModel = loadReadModel(adminDb);
  await adminModel.getApproved(1, { pagination: { page: 1, page_size: 20, offset: 0 } }, true);
  const adminData = adminDb.calls.find((call) => /FROM production_reports pr/.test(call.sql) && /LIMIT \? OFFSET \?/.test(call.sql));
  assert.doesNotMatch(adminData.sql, /manager_processes mp/);

  const managerDb = createFakeDb();
  const managerModel = loadReadModel(managerDb);
  await managerModel.getApproved(33, { pagination: { page: 1, page_size: 20, offset: 0 } }, false);
  const managerData = managerDb.calls.find((call) => /FROM production_reports pr/.test(call.sql) && /LIMIT \? OFFSET \?/.test(call.sql));
  assert.match(managerData.sql, /manager_processes mp/);
  assert.ok(managerData.params.includes(33));
});

test('BEHAVIORAL: process options are scoped for manager and global for admin', async () => {
  const managerDb = createFakeDb();
  const managerModel = loadReadModel(managerDb);
  const managerResult = await managerModel.getPending(44, { pagination: { page: 1, page_size: 20, offset: 0 } }, false);
  assert.deepEqual(managerResult.processes.map((item) => item.process_name), ['Gia công', 'Mài']);
  const managerProcessCall = managerDb.calls.find((call) => /FROM processes p/.test(call.sql));
  assert.match(managerProcessCall.sql, /manager_processes/);
  assert.deepEqual(managerProcessCall.params, [44]);

  const adminDb = createFakeDb();
  const adminModel = loadReadModel(adminDb);
  await adminModel.getPending(1, { pagination: { page: 1, page_size: 20, offset: 0 } }, true);
  const adminProcessCall = adminDb.calls.find((call) => /FROM processes p/.test(call.sql));
  assert.doesNotMatch(adminProcessCall.sql, /manager_processes/);
});

test('BEHAVIORAL: search remains substring-compatible and parameterized', async () => {
  const db = createFakeDb();
  const model = loadReadModel(db);
  await model.getApproved(5, { search: 'ABC', pagination: { page: 1, page_size: 20, offset: 0 } }, false);
  const call = db.calls.find((entry) => /FROM production_reports pr/.test(entry.sql) && /LIMIT \? OFFSET \?/.test(entry.sql));
  assert.match(call.sql, /w\.worker_code LIKE \?/);
  assert.equal(call.params.filter((value) => value === '%ABC%').length, 5);
  assert.doesNotMatch(call.sql, /%ABC%/);
});

test('BEHAVIORAL: pending API emits pagination metadata and bounded data', async () => {
  const fakeModel = {
    getPending: async (_userId, filters) => ({
      items: [{ id: filters.pagination.offset + 1 }],
      pagination: { page: filters.pagination.page, page_size: filters.pagination.pageSize, total: 41, total_pages: 3 },
      processes: [{ id: 1, process_name: 'Mài' }], previous_count: 9
    })
  };
  const controller = loadManagementController(fakeModel);
  const req = { user: { id: 71, role: 'manager' }, query: { page: '2', page_size: '20', shift: 'A' } };
  const res = makeResponse();
  await controller.getPendingReports(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].id, 21);
  assert.deepEqual(res.body.pagination, { page: 2, page_size: 20, total: 41, total_pages: 3 });
  assert.equal(res.body.previous_count, 9);
});

test('BEHAVIORAL: invalid pagination is rejected before repository access', async () => {
  let called = false;
  const controller = loadManagementController({ getPending: async () => { called = true; return {}; } });
  const req = { user: { id: 72, role: 'manager' }, query: { page: '-2' } };
  const res = makeResponse();
  await controller.getPendingReports(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'PAGINATION_INVALID');
  assert.equal(called, false);
});

test('BEHAVIORAL: oversized approval batch is rejected before transaction/model mutation', async () => {
  let called = false;
  const controller = loadManagementController({ approveSelected: async () => { called = true; } });
  const reports = Array.from({ length: 101 }, (_, index) => ({ id: index + 1, expected_updated_at: '2026-08-13T00:00:00.000Z' }));
  const req = { user: { id: 73, role: 'manager' }, body: { targets: reports } };
  const res = makeResponse();
  await controller.approveSelectedReports(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /100/);
  assert.equal(called, false);
});
