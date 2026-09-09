const assert = require('assert');
const { buildCanonicalLogicalDuplicateIdentity, buildLogicalDuplicateKey } = require('../services/logicalDuplicateReportService');
const { normalizeWorkType } = require('../models/nonProductWorkCreateModel');

test('CVK treats Xuất and Nhập as one Xuất nhập work type', () => {
  assert.equal(normalizeWorkType('Xuất'), 'XUẤT NHẬP');
  assert.equal(normalizeWorkType('Nhập'), 'XUẤT NHẬP');
  assert.equal(normalizeWorkType('Xuất nhập'), 'XUẤT NHẬP');
});

test('CVK duplicate identity includes work type', () => {
  const base = { workerId: 10, processId: 60006, processCode: 'CVK', workDate: '2026-09-09', shift: 'A', operationMode: 'MANUAL', machineNo: null, productName: null };
  const xuatNhap = buildCanonicalLogicalDuplicateIdentity({ ...base, workType: 'Xuất nhập' });
  const hoTro = buildCanonicalLogicalDuplicateIdentity({ ...base, workType: 'Hỗ trợ' });
  assert.notEqual(xuatNhap, hoTro);
  assert.notEqual(buildLogicalDuplicateKey({ ...base, workType: 'Xuất nhập' }), buildLogicalDuplicateKey({ ...base, workType: 'Hỗ trợ' }));
});
