#!/usr/bin/env node
'use strict';

/**
 * One-time bootstrap of the first KTC Super Admin account.
 *
 *   node scripts/createSuperAdmin.js --print-sql     # prints a one-time INSERT (hash only) for the TiDB console
 *   node scripts/createSuperAdmin.js --apply         # inserts directly using the configured DB connection
 *
 * Password source (never stored in source, never echoed):
 *   - KTC_SUPERADMIN_PASSWORD environment variable, or
 *   - interactive hidden prompt (asked twice).
 * Hashing: bcrypt cost 10 — identical to the existing KTC account hashing (adminMasterController,
 * userUpdateController) and verified by authController with bcrypt.compare.
 *
 * Run-once: refuses when ANY super_admin already exists or the username is taken. The generated SQL
 * carries the same guard (INSERT ... SELECT ... WHERE NOT EXISTS), so re-running it inserts nothing.
 * Existing accounts (e.g. the current admins) are never read for update, changed or deleted.
 */

const bcrypt = require('bcrypt');
const readline = require('node:readline');

const USERNAME = 'superadmin';
const FULL_NAME = 'KTC Super Administrator';
const ROLE = 'super_admin';
const BCRYPT_COST = 10;

function assertStrongPassword(password) {
  const value = String(password || '');
  const problems = [];
  if (value.length < 14) problems.push('ít nhất 14 ký tự');
  if (!/[a-z]/.test(value)) problems.push('chữ thường');
  if (!/[A-Z]/.test(value)) problems.push('chữ hoa');
  if (!/[0-9]/.test(value)) problems.push('chữ số');
  if (!/[^A-Za-z0-9]/.test(value)) problems.push('ký tự đặc biệt');
  if (/superadmin|ktc|password|123456/i.test(value)) problems.push('không chứa tên tài khoản/từ phổ biến');
  if (problems.length) throw new Error(`Mật khẩu chưa đủ mạnh: cần ${problems.join(', ')}.`);
  return value;
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error('Không có terminal tương tác; đặt KTC_SUPERADMIN_PASSWORD trong môi trường của phiên này.'));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => { if (text.includes(question)) rl.output.write(text); };
    rl.question(question, (answer) => { rl.output.write('\n'); rl.close(); resolve(answer); });
  });
}

async function readPassword() {
  if (process.env.KTC_SUPERADMIN_PASSWORD) return assertStrongPassword(process.env.KTC_SUPERADMIN_PASSWORD);
  const first = await askHidden('Mật khẩu Super Admin: ');
  const second = await askHidden('Nhập lại mật khẩu: ');
  if (first !== second) throw new Error('Hai lần nhập mật khẩu không khớp.');
  return assertStrongPassword(first);
}

const sqlString = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;

function buildBootstrapSql(passwordHash) {
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash)) throw new Error('Hash bcrypt không hợp lệ');
  return `-- KTC: tạo Super Admin đầu tiên (chạy MỘT lần). Chỉ chứa hash bcrypt, không có mật khẩu.
-- Không sửa / xóa tài khoản nào khác. Chạy lại không tạo thêm dòng (WHERE NOT EXISTS).
START TRANSACTION;
INSERT INTO users (username, password, full_name, role, status)
SELECT ${sqlString(USERNAME)}, ${sqlString(passwordHash)}, ${sqlString(FULL_NAME)}, ${sqlString(ROLE)}, 'active' FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = ${sqlString(ROLE)} OR username = ${sqlString(USERNAME)});
INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, metadata_json)
SELECT u.id, 'SUPER_ADMIN_BOOTSTRAPPED', 'user', u.id, 'Khởi tạo tài khoản Super Admin đầu tiên', JSON_OBJECT('source', 'createSuperAdmin.js --print-sql')
  FROM users u
 WHERE u.username = ${sqlString(USERNAME)} AND u.role = ${sqlString(ROLE)}
   AND NOT EXISTS (SELECT 1 FROM activity_logs a WHERE a.action = 'SUPER_ADMIN_BOOTSTRAPPED');
COMMIT;
-- Kiểm tra (phải trả 1 dòng superadmin / super_admin / active; 2 admin hiện có không đổi):
SELECT id, username, full_name, role, status FROM users WHERE role IN ('super_admin', 'admin') ORDER BY id;
`;
}

async function applyDirect(passwordHash) {
  const db = require('../config/db');
  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query('SELECT id, username, role FROM users WHERE role = ? OR username = ? LIMIT 1 FOR UPDATE', [ROLE, USERNAME]);
    if (existing.length) throw new Error(`Đã tồn tại tài khoản ${existing[0].username} (${existing[0].role}); script chỉ chạy một lần.`);
    const [result] = await connection.query('INSERT INTO users (username, password, full_name, role, status) VALUES (?, ?, ?, ?, ?)', [USERNAME, passwordHash, FULL_NAME, ROLE, 'active']);
    const id = Number(result.insertId);
    await connection.query('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, metadata_json) VALUES (?, ?, ?, ?, ?, ?)', [id || null, 'SUPER_ADMIN_BOOTSTRAPPED', 'user', String(id || ''), 'Khởi tạo tài khoản Super Admin đầu tiên', JSON.stringify({ source: 'createSuperAdmin.js --apply' })]);
    await connection.commit();
    return id;
  } catch (error) {
    try { await connection.rollback(); } catch (_) { /* keep original error */ }
    throw error;
  } finally {
    connection.release();
    if (typeof db.closePool === 'function') await db.closePool().catch(() => undefined);
  }
}

async function main(argv = process.argv.slice(2)) {
  const mode = argv.includes('--apply') ? 'apply' : argv.includes('--print-sql') ? 'sql' : null;
  if (!mode) {
    console.error('Dùng: node scripts/createSuperAdmin.js --print-sql | --apply');
    process.exitCode = 2;
    return;
  }
  const password = await readPassword();
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  if (!(await bcrypt.compare(password, hash))) throw new Error('Tự kiểm tra hash thất bại');
  if (mode === 'sql') {
    process.stdout.write(buildBootstrapSql(hash));
    return;
  }
  const id = await applyDirect(hash);
  console.log(`Đã tạo Super Admin "${USERNAME}" (id ${id}). Đăng nhập tại /login.`);
}

if (require.main === module) {
  main().catch((error) => { console.error(`[KTC] createSuperAdmin: ${error.message}`); process.exitCode = 1; });
}

module.exports = { assertStrongPassword, buildBootstrapSql, USERNAME, FULL_NAME, ROLE, BCRYPT_COST };
