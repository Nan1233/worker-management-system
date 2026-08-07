const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('monthly Excel resolves detail labels from DB field aliases', () => {
  const source = read('../desktop/electron/monthlyWorkbookLocal.cjs');

  assert.match(
    source,
    /function detailId\(item, kind\)/,
    'Excel phải ghép chi tiết theo ID'
  );
  assert.match(
    source,
    /function detailCode\(item, kind\)/,
    'Excel phải hỗ trợ alias mã chi tiết'
  );
  assert.match(
    source,
    /function detailLabel\(item, kind\)/,
    'Excel phải hỗ trợ alias tên chi tiết'
  );
  assert.match(
    source,
    /function detailAliases\(item, kind\)/,
    'Excel phải tạo tập alias để nối master data với detail theo ID, code hoặc tên'
  );
  assert.match(
    source,
    /function detailValue\(item, kind\)/,
    'Excel phải đọc giá trị chi tiết từ các alias trường dữ liệu DB'
  );
  assert.match(
    source,
    /function detailMap\(items, kind\)/,
    'Excel phải lập bản đồ giá trị chi tiết theo alias'
  );

  assert.match(
    source,
    /item\?\.deduction_type_id \?\? item\?\.type_id \?\? item\?\.id/,
    'Trừ giờ phải hỗ trợ deduction_type_id, type_id và id'
  );
  assert.match(
    source,
    /item\?\.defect_type_id \?\? item\?\.type_id \?\? item\?\.id/,
    'NG phải hỗ trợ defect_type_id, type_id và id'
  );
  assert.match(
    source,
    /item\?\.deduction_type_code \?\? item\?\.deduction_code \?\? item\?\.type_code \?\? item\?\.code/,
    'Trừ giờ phải hỗ trợ các alias mã từ DB'
  );
  assert.match(
    source,
    /item\?\.defect_type_code \?\? item\?\.defect_code \?\? item\?\.type_code \?\? item\?\.code/,
    'NG phải hỗ trợ các alias mã từ DB'
  );
  assert.match(
    source,
    /item\?\.deduction_type_name \?\? item\?\.deduction_name \?\? item\?\.type_name/,
    'Trừ giờ phải hỗ trợ các alias tên từ DB'
  );
  assert.match(
    source,
    /item\?\.defect_type_name \?\? item\?\.defect_name \?\? item\?\.type_name/,
    'NG phải hỗ trợ các alias tên từ DB'
  );
  assert.match(
    source,
    /item\?\.deduction_hours \?\? item\?\.duration_hours \?\? item\?\.time_hours \?\? item\?\.hours \?\? item\?\.value/,
    'Trừ giờ phải đọc được các alias số giờ'
  );
  assert.match(
    source,
    /item\?\.defect_quantity \?\? item\?\.ng_quantity \?\? item\?\.quantity \?\? item\?\.qty \?\? item\?\.value/,
    'NG phải đọc được các alias số lượng'
  );

  assert.doesNotMatch(
    source,
    /detailMapValue/,
    'Không được phụ thuộc vào tên hàm detailMapValue đã bỏ'
  );
});
