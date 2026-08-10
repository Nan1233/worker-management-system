'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const snapshot = require('../data/mau-goc-ktc.json');

test('snapshot file mẫu chứa đủ các nhóm master chính', () => {
  assert.equal(snapshot.processes.length, 9);
  assert.ok(snapshot.workers.length >= 500, 'phải giữ danh sách nhân sự lớn từ file mẫu');
  assert.ok(snapshot.machines.length >= 100, 'phải giữ danh sách máy');
  assert.ok(snapshot.product_aliases.length >= 700, 'phải giữ mapping mã công đoạn -> mã sản phẩm');
  assert.ok(snapshot.product_standards.length >= 1900, 'phải giữ đầy đủ các biến thể định mức');
  assert.equal(snapshot.source_inventory.length, 21, 'file mẫu gốc có 21 sheet');
  assert.match(snapshot.meta.sha256, /^[a-f0-9]{64}$/);
});

test('định mức giữ được số thập phân', () => {
  assert.ok(snapshot.product_standards.some((x) => !Number.isInteger(Number(x.standard_output))));
});
