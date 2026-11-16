const test = require("node:test");
const assert = require("node:assert/strict");
const { ensureCustomReportCategories } = require("../services/customReportCategoryService");

function fakeDb() {
  const types = new Map();
  const sqlLog = [];
  let nextId = 100;
  const query = async (sql, params = []) => {
    sqlLog.push({ sql, params });
    if (/INSERT IGNORE INTO/.test(sql)) {
      for (let i = 0; i < params.length; i += 3) {
        const [processId, code, name] = params.slice(i, i + 3);
        const key = `${processId}:${code}`;
        if (!types.has(key)) types.set(key, { id: ++nextId, category_code: code, category_name: name });
      }
      return { affectedRows: 1 };
    }
    if (/SELECT id, .* AS category_name FROM/.test(sql)) {
      const [processId, ...codes] = params;
      return codes.map((code) => types.get(`${processId}:${code}`)).filter(Boolean);
    }
    throw new Error(`Unexpected query ${sql}`);
  };
  return { query, types, sqlLog };
}

test("named NG khác is registered, gets an ID, and stays process scoped", async () => {
  const db = fakeDb();
  const defects = [{ defect_name: "Vết xước lạ", custom_other: true, quantity: 4 }];
  await ensureCustomReportCategories({ processId: 3, defects, query: db.query });
  assert.ok(defects[0].defect_type_id > 0);
  assert.match(defects[0].defect_code, /^CUSTOM_NG_[A-F0-9]{20}$/);
  assert.equal(db.types.size, 1);
  await ensureCustomReportCategories({ processId: 3, defects, query: db.query });
  assert.equal(db.types.size, 1);
  const other = [{ defect_name: "Vết xước lạ", custom_other: true, quantity: 2 }];
  await ensureCustomReportCategories({ processId: 7, defects: other, query: db.query });
  assert.notEqual(other[0].defect_type_id, defects[0].defect_type_id);
});

test("named Trừ giờ khác receives canonical deduction ID", async () => {
  const db = fakeDb();
  const deductions = [{ deduction_name: "Kiểm tra linh kiện", custom_other: true, hours: 0.5 }];
  await ensureCustomReportCategories({ processId: 4, deductions, query: db.query });
  assert.ok(deductions[0].deduction_type_id > 0);
  assert.match(deductions[0].deduction_code, /^CUSTOM_DED_[A-F0-9]{20}$/);
});

test("rejects blank or invalid user-defined names", async () => {
  const db = fakeDb();
  await assert.rejects(() => ensureCustomReportCategories({
    processId: 1, defects: [{ defect_name: "  ", custom_other: true, quantity: 5 }], query: db.query
  }), /Phải nhập tên/);
  await assert.rejects(() => ensureCustomReportCategories({
    processId: 1, deductions: [{ deduction_name: "A".repeat(101), custom_other: true, hours: 1 }], query: db.query
  }), /Phải nhập tên/);
  assert.equal(db.sqlLog.length, 0);
});
