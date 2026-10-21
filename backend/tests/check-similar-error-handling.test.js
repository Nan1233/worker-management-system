const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query(){}, promise(){ return { query: async () => [[]] }; } } };
const ctrlPath = require.resolve('../controllers/productionTempWorkerController');
const valPath = require.resolve('../services/reportBusinessValidationService');
const modelPath = require.resolve('../models/productionTempModel');

function load({ validate, findSimilar }) {
  for (const p of [ctrlPath]) delete require.cache[p];
  const orig = { val: require.cache[valPath], model: require.cache[modelPath] };
  const real = require('../services/reportBusinessValidationService');
  require.cache[valPath].exports = { ...real, validateMasterData: validate };
  const model = require('../models/productionTempModel');
  const origFind = model.findSimilarReport;
  model.findSimilarReport = findSimilar || (async () => null);
  const ctrl = require('../controllers/productionTempWorkerController');
  return { ctrl, restore() { require.cache[valPath].exports = real; model.findSimilarReport = origFind; delete require.cache[ctrlPath]; } };
}
const body = { process_id: 1, work_date: new Date().toISOString().slice(0, 10), shift: 'A', machine_no: 'C13', product_name: 'C7236' };
const mkRes = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const call = async (h, headers = {}) => { const res = mkRes(); const logs = []; const orig = console.error; console.error = (...a) => logs.push(a.join(' ')); try { await h.ctrl.checkSimilarReport({ user: { worker_id: 7 }, body, headers }, res); } finally { console.error = orig; } return { res, logs }; };

test('success: no similar report', async () => {
  const h = load({ validate: async () => ({ valid: true, machineCode: 'C13', productCode: 'R7236' }) });
  try { const { res } = await call(h); assert.equal(res.code, 200); assert.equal(res.body.duplicate, false); } finally { h.restore(); }
});

test('product/standard not found stays a 422 business error with its code and is not turned into "no similar report"', async () => {
  const err = Object.assign(new Error('Không xác định duy nhất định mức sản phẩm C7236 / CUT trong công đoạn'), { status: 422, code: 'HISTORICAL_STANDARD_NOT_FOUND', isPublic: true });
  const h = load({ validate: async () => { throw err; } });
  try {
    const { res, logs } = await call(h, { 'x-request-id': 'req-1', 'cf-ray': 'ray-1', authorization: 'Bearer SECRET' });
    assert.equal(res.code, 422);
    assert.equal(res.body.code, 'HISTORICAL_STANDARD_NOT_FOUND');
    assert.notEqual(res.body.duplicate, false);
    const log = JSON.parse(logs[0].replace('CHECK SIMILAR REPORT ERROR: ', ''));
    assert.equal(log.code, 'HISTORICAL_STANDARD_NOT_FOUND');
    assert.equal(log.requestId, 'req-1');
    assert.equal(log.businessError, true);
    assert.doesNotMatch(logs[0], /SECRET|Bearer/);
  } finally { h.restore(); }
});

test('invalid master data returns 422 and does not call the duplicate lookup', async () => {
  let looked = false;
  const h = load({ validate: async () => ({ valid: false, errors: { product_name: 'x' } }), findSimilar: async () => { looked = true; } });
  try { const { res } = await call(h); assert.equal(res.code, 422); assert.equal(looked, false); } finally { h.restore(); }
});

test('database error is a 500 with a generic message, never "no similar report"', async () => {
  const err = Object.assign(new Error("Unknown column 'x' in 'field list'"), { code: 'ER_BAD_FIELD_ERROR', errno: 1054 });
  const h = load({ validate: async () => { throw err; } });
  const prevEnv = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try {
    const { res, logs } = await call(h);
    assert.equal(res.code, 500);
    assert.doesNotMatch(String(res.body.message), /Unknown column/);
    assert.notEqual(res.body.duplicate, false);
    assert.match(logs[0], /ER_BAD_FIELD_ERROR/);
  } finally { process.env.NODE_ENV = prevEnv; h.restore(); }
});

test('unexpected exception is a 500 and is logged with its failing step', async () => {
  const h = load({ validate: async () => { throw new TypeError('boom'); } });
  try { const { res, logs } = await call(h); assert.equal(res.code, 500); assert.match(logs[0], /check_similar_failed/); assert.match(logs[0], /boom/); } finally { h.restore(); }
});
