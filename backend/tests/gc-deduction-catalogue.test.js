const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Stateful fake of the deduction_types table, starting in the state migration
// 038 left GC in: only the 10 old types active, the other 6 inactive.
const GC_NAMES = ['Thiếu sản lượng','Bật máy, xét máy','Chuyển mã','Chỉnh máy','Chờ chỉnh máy','Mất điện','Mất khí','Chờ hàng','bảo dưỡng máy','Nghỉ giải lao','Giao ca','Dừng máy đi hỗ trợ','Giặt cs/cân cs, tuốt-tái pp, GL','5s','Học việc, đào tạo','Đi muộn về sớm'];
const INACTIVE_AFTER_038 = new Set(['Bật máy, xét máy','Chờ chỉnh máy','Mất điện','Mất khí','Chờ hàng','bảo dưỡng máy']);

function makeDb() {
  let nextId = 100;
  const rows = GC_NAMES.map((name, i) => ({ id: i + 1, process_id: 1, deduction_code: `C${i}`, deduction_name: name, sort_order: i + 1, status: INACTIVE_AFTER_038.has(name) ? 'inactive' : 'active' }));
  const lc = (v) => String(v || '').trim().toLowerCase();
  const run = (sql, params = []) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (/FROM processes/.test(q) && /WHERE id = \?/.test(q)) return [[{ id: 1, process_code: 'GC', status: 'active' }]];
    if (/^UPDATE deduction_types SET status = 'inactive'/.test(q)) {
      const [pid, ...keep] = params;
      rows.filter((r) => r.process_id === pid && !keep.includes(lc(r.deduction_name))).forEach((r) => { r.status = 'inactive'; });
      return [{}];
    }
    if (/^SELECT id FROM deduction_types/.test(q)) {
      const hit = rows.find((r) => r.process_id === params[0] && lc(r.deduction_name) === lc(params[1]));
      return [hit ? [{ id: hit.id }] : []];
    }
    if (/^UPDATE deduction_types SET deduction_code/.test(q)) {
      const r = rows.find((x) => x.id === params[2]); Object.assign(r, { deduction_code: params[0], sort_order: params[1], status: 'active' }); return [{}];
    }
    if (/^UPDATE deduction_types SET sort_order/.test(q)) {
      const r = rows.find((x) => x.id === params[1]); Object.assign(r, { sort_order: params[0], status: 'active' }); return [{}];
    }
    if (/^INSERT INTO deduction_types/.test(q)) {
      rows.push({ id: nextId++, process_id: params[0], deduction_code: params[1], deduction_name: params[2], sort_order: params[3], status: 'active' }); return [{}];
    }
    throw new Error(`unexpected sql: ${q}`);
  };
  return {
    rows,
    promise: () => ({ query: async (sql, params) => run(sql, params) }),
    query: (sql, params, cb) => {
      const [pid, ...names] = params;
      const out = rows.filter((r) => r.process_id === pid && r.status === 'active' && names.includes(lc(r.deduction_name))).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      cb(null, out);
    },
  };
}

test('GC deduction API returns all 16 types and does not re-deactivate the 6 restored ones', async () => {
  const fake = makeDb();
  const dbPath = require.resolve(path.join('..', 'config', 'db'));
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fake };
  const Deduction = require('../models/deductionModel');

  for (let call = 0; call < 2; call += 1) { // second call proves the self-heal no longer undoes 053
    const result = await Deduction.getByProcess(1);
    assert.equal(result.length, 16);
    assert.deepEqual(result.map((r) => r.deduction_name), GC_NAMES);
  }
});
