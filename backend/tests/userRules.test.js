const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../controllers/userController');

test('phân cấp tạo người dùng giữ đúng code cũ', () => {
  assert.deepEqual(_test.manageableRoles('admin'), ['manager','lead','worker']);
  assert.deepEqual(_test.manageableRoles('manager'), ['lead','worker']);
  assert.deepEqual(_test.manageableRoles('lead'), ['worker']);
  assert.deepEqual(_test.manageableRoles('worker'), []);
});

test('chuẩn hóa process_ids loại bỏ giá trị lỗi và trùng', () => {
  assert.deepEqual(_test.normalizeProcessIds(['2', 1, 2, 0, -1, 'x']), [2,1]);
});

test('trạng thái chỉ nhận inactive, còn lại active', () => {
  assert.equal(_test.normalizeStatus('inactive'), 'inactive');
  assert.equal(_test.normalizeStatus('active'), 'active');
  assert.equal(_test.normalizeStatus('bad'), 'active');
});
