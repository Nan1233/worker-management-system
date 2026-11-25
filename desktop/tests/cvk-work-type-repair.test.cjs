'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizedWorkTypeLabel, isNonProductWorkReport } = require('../electron/nonProductWorkReport.cjs');

test('CVK preserves work classification instead of product code', () => {
  assert.equal(normalizedWorkTypeLabel({process_code:'CVK', extra_data:'{"work_type":"TAIPP"}',product_code:'P123'}),'TPP');
  assert.equal(normalizedWorkTypeLabel({process_code:'CVK', work_type:'XUATNHAP'}),'XN');
  assert.equal(normalizedWorkTypeLabel({process_code:'CVK', product_code:'P123'}),'');
  assert.equal(normalizedWorkTypeLabel({process_code:'GC', work_type:'TAIPP'}),'');
  assert.equal(isNonProductWorkReport({non_product_work:true}),true);
});
