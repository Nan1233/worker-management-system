const bcrypt = require('bcrypt');
const db = require('../config/db');
const { clearWorkerProfile } = require('../utils/workerProfileCache');
const { deleteCachedAuthUser } = require('../utils/authUserCache');

const normalizeProcessIds = (value) => [...new Set((Array.isArray(value) ? value : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];

const buildInsert = (table, payload) => {
  const fields = Object.keys(payload);
  const placeholders = fields.map(() => '?').join(',');
  return {
    sql: `INSERT INTO ${table} (${fields.map((field) => `\`${field.replace(/`/g, '``')}\``).join(',')}) VALUES (${placeholders})`,
    values: fields.map((field) => payload[field])
  };
};

async function insertAssignments(connection, role, userId, workerId, processIds) {
  if (!processIds.length) return;
  const table = role === 'worker' ? 'worker_processes' : 'manager_processes';
  const idField = role === 'worker' ? 'worker_id' : 'manager_id';
  const targetId = role === 'worker' ? workerId : userId;
  for (const processId of processIds) {
    await connection.query(
      `INSERT INTO ${table} (${idField}, process_id) VALUES (?, ?)`,
      [targetId, processId]
    );
  }
}

async function validateProcessIds(connection, processIds) {
  if (!processIds.length) throw Object.assign(new Error('Phải phân ít nhất một công đoạn'), { status: 400 });
  const [rows] = await connection.query(
    `SELECT id FROM processes WHERE id IN (${processIds.map(() => '?').join(',')}) AND status='active'`,
    processIds
  );
  const valid = new Set(rows.map((row) => Number(row.id)));
  if (valid.size !== processIds.length) {
    throw Object.assign(new Error('Có công đoạn không tồn tại hoặc đã ngừng sử dụng'), { status: 400 });
  }
}

exports.createUser = async (req, res) => {
  const connection = await db.promise().getConnection();
  let transactionStarted = false;
  try {
    const body = req.body || {};
    const role = String(body.role || '').trim().toLowerCase();
    if (!['manager', 'lead', 'worker'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Vai trò không hợp lệ' });
    }

    const username = String(body.username || '').trim();
    const fullName = String(body.full_name || '').trim();
    if (!username) return res.status(400).json({ success: false, message: 'Tên đăng nhập không được để trống' });
    if (!fullName) return res.status(400).json({ success: false, message: 'Họ tên không được để trống' });

    const processIds = normalizeProcessIds(body.process_ids);
    await validateProcessIds(connection, processIds);

    let password = String(body.password || '');
    if (!password) password = require('crypto').randomBytes(32).toString('hex');
    if (password.length < 6) return res.status(400).json({ success: false, message: 'Mật khẩu tối thiểu 6 ký tự' });

    await connection.beginTransaction();
    transactionStarted = true;

    const userInsert = buildInsert('users', {
      username,
      password: await bcrypt.hash(password, 10),
      full_name: fullName,
      role,
      status: body.status === 'inactive' ? 'inactive' : 'active'
    });
    const [userResult] = await connection.query(userInsert.sql, userInsert.values);
    const userId = Number(userResult.insertId);

    let workerId = null;
    if (role === 'worker') {
      const trainingPercent = Number(body.training_percent ?? 100);
      if (!Number.isFinite(trainingPercent) || trainingPercent < 0 || trainingPercent > 100) {
        throw Object.assign(new Error('% học việc phải từ 0 đến 100'), { status: 400 });
      }
      const workerInsert = buildInsert('workers', {
        user_id: userId,
        worker_code: String(body.worker_code || '').trim() || null,
        phone: String(body.phone || '').trim() || null,
        department: String(body.department || 'Sản xuất').trim() || 'Sản xuất',
        position: String(body.position || 'Công nhân').trim() || 'Công nhân',
        training_percent: trainingPercent,
        status: body.status === 'inactive' ? 'inactive' : 'active'
      });
      const [workerResult] = await connection.query(workerInsert.sql, workerInsert.values);
      workerId = Number(workerResult.insertId);
    }

    await insertAssignments(connection, role, userId, workerId, processIds);
    await connection.commit();
    transactionStarted = false;

    clearWorkerProfile(userId);
    deleteCachedAuthUser(userId);
    return res.status(201).json({ success: true, message: 'Tạo người dùng thành công', data: { id: userId } });
  } catch (error) {
    if (transactionStarted) {
      try { await connection.rollback(); } catch (_) {}
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Tên đăng nhập hoặc mã công nhân đã tồn tại' });
    }
    if (error?.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('CREATE USER ERROR:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Không thể tạo người dùng' });
  } finally {
    connection.release();
  }
};
