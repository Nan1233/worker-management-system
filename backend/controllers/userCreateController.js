const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../config/db');
const { clearWorkerProfile } = require('../utils/workerProfileCache');
const { deleteCachedAuthUser } = require('../utils/authUserCache');

const normalizeProcessIds = (value) => [...new Set((Array.isArray(value) ? value : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
const buildInsert = (table, payload) => {
  const fields = Object.keys(payload);
  return { sql: `INSERT INTO ${table} (${fields.map((field) => `\`${field.replace(/`/g, '``')}\``).join(',')}) VALUES (${fields.map(() => '?').join(',')})`, values: fields.map((field) => payload[field]) };
};

// TiDB Cloud / serverless drivers may not expose insertId reliably. Always
// resolve generated IDs with a SELECT before using them as foreign keys.
async function findUserIdByUsername(connection, username) {
  const [rows] = await connection.query('SELECT id FROM users WHERE username=? LIMIT 1', [username]);
  const id = Number(rows?.[0]?.id);
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('Không lấy được ID tài khoản vừa tạo'), { status: 500 });
  return id;
}

async function findWorkerIdByUserId(connection, userId) {
  const [rows] = await connection.query('SELECT id FROM workers WHERE user_id=? LIMIT 1', [userId]);
  const id = Number(rows?.[0]?.id);
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('Không lấy được ID công nhân vừa tạo'), { status: 500 });
  return id;
}

async function insertAssignments(connection, role, userId, workerId, processIds) {
  if (!processIds.length) return;
  const table = role === 'worker' ? 'worker_processes' : 'manager_processes';
  const idField = role === 'worker' ? 'worker_id' : 'manager_id';
  const targetId = role === 'worker' ? workerId : userId;
  if (!Number.isInteger(Number(targetId)) || Number(targetId) <= 0) {
    throw Object.assign(new Error('ID đối tượng phân công không hợp lệ'), { status: 500 });
  }
  for (const processId of processIds) await connection.query(`INSERT INTO ${table} (${idField}, process_id) VALUES (?, ?)`, [Number(targetId), processId]);
}

async function validateProcessIds(connection, processIds) {
  if (!processIds.length) throw Object.assign(new Error('Phải phân ít nhất một công đoạn'), { status: 400 });
  const [rows] = await connection.query(`SELECT id FROM processes WHERE id IN (${processIds.map(() => '?').join(',')}) AND status='active'`, processIds);
  const valid = new Set(rows.map((row) => Number(row.id)));
  if (valid.size !== processIds.length) throw Object.assign(new Error('Có công đoạn không tồn tại hoặc đã ngừng sử dụng'), { status: 400 });
}

async function findExistingUser(connection, username) {
  const [users] = await connection.query(
    `SELECT u.id,u.username,u.full_name,u.role,u.status,w.id AS worker_id,w.worker_code
     FROM users u LEFT JOIN workers w ON w.user_id=u.id
     WHERE LOWER(TRIM(u.username))=LOWER(TRIM(?)) LIMIT 1`,
    [username]
  );
  return users[0] || null;
}

async function validateUniqueUser(connection, username, role, workerCode) {
  const existing = await findExistingUser(connection, username);
  if (existing) {
    // A previous failed/legacy seed can leave a worker user without its
    // workers row. That account is repairable when the user is creating the
    // same worker again; do not force a second username.
    if (existing.role === 'worker' && role === 'worker' && !existing.worker_id) {
      if (!workerCode) throw Object.assign(new Error('Mã công nhân là bắt buộc để khôi phục tài khoản công nhân này'), { status: 400 });
      const [workers] = await connection.query(
        `SELECT w.id,w.worker_code,u.username,u.full_name,u.role
         FROM workers w LEFT JOIN users u ON u.id=w.user_id
         WHERE LOWER(TRIM(w.worker_code))=LOWER(TRIM(?)) LIMIT 1`,
        [workerCode]
      );
      if (workers.length) {
        const duplicate = workers[0];
        throw Object.assign(
          new Error(`Mã công nhân "${duplicate.worker_code}" đã tồn tại${duplicate.full_name ? ` (${duplicate.full_name})` : ''}${duplicate.username ? ` với tài khoản "${duplicate.username}"` : ''}. Vui lòng kiểm tra lại.`),
          { status: 409, code: 'WORKER_CODE_EXISTS' }
        );
      }
      return existing;
    }

    const existingRole = existing.role === 'admin' ? 'quản trị viên' : existing.role === 'manager' ? 'quản lý' : existing.role === 'lead' ? 'tổ trưởng' : 'công nhân';
    if (existing.role === 'worker' && role === 'lead') {
      throw Object.assign(
        new Error(`Tài khoản "${existing.username}" đã là tài khoản công nhân${existing.full_name ? ` của ${existing.full_name}` : ''}. Không thể tạo thêm tài khoản Tổ trưởng trùng tên đăng nhập. Nếu muốn nâng chính công nhân này lên Tổ trưởng, hãy dùng nút "Nâng lên Tổ trưởng" tại danh sách công nhân.`),
        { status: 409, code: 'WORKER_ACCOUNT_EXISTS_PROMOTE_LEAD' }
      );
    }
    if (existing.role === 'worker' && role === 'manager') {
      throw Object.assign(
        new Error(`Tài khoản "${existing.username}" đã là tài khoản công nhân${existing.full_name ? ` của ${existing.full_name}` : ''}. Không thể tạo thêm tài khoản Quản lý trùng tên đăng nhập. Nếu muốn nâng chính công nhân này lên Quản lý, hãy dùng nút "Nâng lên Quản lý".`),
        { status: 409, code: 'WORKER_ACCOUNT_EXISTS_PROMOTE_MANAGER' }
      );
    }
    throw Object.assign(
      new Error(`Tên đăng nhập "${existing.username}" đã tồn tại với tài khoản ${existingRole}${existing.full_name ? ` (${existing.full_name})` : ''}. Mỗi tài khoản phải có tên đăng nhập duy nhất.`),
      { status: 409, code: 'USERNAME_EXISTS' }
    );
  }

  if (role === 'worker' && workerCode) {
    const [workers] = await connection.query(
      `SELECT w.id,w.worker_code,u.username,u.full_name,u.role
       FROM workers w LEFT JOIN users u ON u.id=w.user_id
       WHERE LOWER(TRIM(w.worker_code))=LOWER(TRIM(?)) LIMIT 1`,
      [workerCode]
    );
    if (workers.length) {
      const existing = workers[0];
      throw Object.assign(
        new Error(`Mã công nhân "${existing.worker_code}" đã tồn tại${existing.full_name ? ` (${existing.full_name})` : ''}${existing.username ? ` với tài khoản "${existing.username}"` : ''}. Không tạo bản ghi công nhân thứ hai cho cùng một mã.`),
        { status: 409, code: 'WORKER_CODE_EXISTS' }
      );
    }
  }
  return null;
}

exports.createUser = async (req, res) => {
  const connection = await db.promise().getConnection();
  try {
    const body = req.body || {};
    const role = String(body.role || '').trim().toLowerCase();
    if (!['manager', 'lead', 'worker'].includes(role)) return res.status(400).json({ success: false, message: 'Vai trò không hợp lệ' });

    const username = String(body.username || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim();
    if (!username) return res.status(400).json({ success: false, message: 'Tên đăng nhập không được để trống' });
    if (!fullName) return res.status(400).json({ success: false, message: 'Họ tên không được để trống' });

    const processIds = normalizeProcessIds(body.process_ids);
    await validateProcessIds(connection, processIds);

    const workerCode = String(body.worker_code || '').trim();
    const existingUser = await validateUniqueUser(connection, username, role, workerCode);

    // Repair an orphaned worker account instead of inserting a second users row.
    if (existingUser?.role === 'worker' && role === 'worker' && !existingUser.worker_id) {
      const trainingPercent = Number(body.training_percent ?? 100);
      if (!Number.isFinite(trainingPercent) || trainingPercent < 0 || trainingPercent > 100) {
        throw Object.assign(new Error('% học việc phải từ 0 đến 100'), { status: 400 });
      }
      await connection.beginTransaction();
      try {
        await connection.query(
          `UPDATE users SET full_name=?, status=? WHERE id=?`,
          [fullName, body.status === 'inactive' ? 'inactive' : 'active', Number(existingUser.id)]
        );
        await connection.query(
          `INSERT INTO workers (user_id,worker_code,phone,department,position,training_percent,status) VALUES (?,?,?,?,?,?,?)`,
          [Number(existingUser.id), workerCode, String(body.phone || '').trim() || null, String(body.department || 'Sản xuất').trim() || 'Sản xuất', String(body.position || 'Công nhân').trim() || 'Công nhân', trainingPercent, body.status === 'inactive' ? 'inactive' : 'active']
        );
        const workerId = await findWorkerIdByUserId(connection, Number(existingUser.id));
        await insertAssignments(connection, 'worker', Number(existingUser.id), workerId, processIds);
        await connection.commit();
        clearWorkerProfile(Number(existingUser.id));
        deleteCachedAuthUser(Number(existingUser.id));
        return res.status(201).json({
          success: true,
          message: 'Đã khôi phục và tạo công nhân từ tài khoản có sẵn',
          data: { id: Number(existingUser.id), worker_id: workerId, repaired: true }
        });
      } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        throw error;
      }
    }

    let password = String(body.password || '');
    if (!password) password = crypto.randomBytes(32).toString('hex');
    if (password.length < 6) return res.status(400).json({ success: false, message: 'Mật khẩu tối thiểu 6 ký tự' });

    const userInsert = buildInsert('users', {
      username,
      password: await bcrypt.hash(password, 10),
      full_name: fullName,
      role,
      status: body.status === 'inactive' ? 'inactive' : 'active'
    });
    await connection.query(userInsert.sql, userInsert.values);
    const userId = await findUserIdByUsername(connection, username);

    let workerId = null;
    if (role === 'worker') {
      const trainingPercent = Number(body.training_percent ?? 100);
      if (!Number.isFinite(trainingPercent) || trainingPercent < 0 || trainingPercent > 100) {
        throw Object.assign(new Error('% học việc phải từ 0 đến 100'), { status: 400 });
      }
      const workerInsert = buildInsert('workers', {
        user_id: userId,
        worker_code: workerCode || null,
        phone: String(body.phone || '').trim() || null,
        department: String(body.department || 'Sản xuất').trim() || 'Sản xuất',
        position: String(body.position || 'Công nhân').trim() || 'Công nhân',
        training_percent: trainingPercent,
        status: body.status === 'inactive' ? 'inactive' : 'active'
      });
      await connection.query(workerInsert.sql, workerInsert.values);
      workerId = await findWorkerIdByUserId(connection, userId);
    }

    await insertAssignments(connection, role, userId, workerId, processIds);
    clearWorkerProfile(userId);
    deleteCachedAuthUser(userId);
    return res.status(201).json({ success: true, message: 'Tạo người dùng thành công', data: { id: userId, worker_id: workerId } });
  } catch (error) {
    const message = String(error?.message || '');
    if (error?.code === 'ER_DUP_ENTRY' || /duplicate entry/i.test(message) || /uq_users_username/i.test(message)) {
      if (/worker_code|uq_.*worker.*code/i.test(message)) return res.status(409).json({ success: false, code: 'WORKER_CODE_EXISTS', message: 'Mã công nhân đã tồn tại. Không thể tạo công nhân thứ hai với cùng mã.' });
      return res.status(409).json({ success: false, code: 'USERNAME_EXISTS', message: 'Tên đăng nhập đã tồn tại. Vui lòng dùng tài khoản hiện có hoặc chọn tên đăng nhập khác.' });
    }
    if (error?.status) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    console.error('CREATE USER ERROR:', error);
    return res.status(500).json({ success: false, message: message || 'Không thể tạo người dùng' });
  } finally { connection.release(); }
};
