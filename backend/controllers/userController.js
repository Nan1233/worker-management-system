const bcrypt = require('bcrypt');
const db = require('../config/db');

const ROLE_CREATE_RULES = {
  admin: ['manager', 'lead', 'worker'],
  manager: ['lead', 'worker'],
  lead: ['worker']
};

function manageableRoles(role) {
  return ROLE_CREATE_RULES[role] || [];
}

function normalizeStatus(value) {
  return value === 'inactive' ? 'inactive' : 'active';
}

function publicError(res, error, fallback) {
  console.error(fallback, error);
  return res.status(500).json({ success: false, message: fallback });
}

exports.getAllUsers = async (req, res) => {
  try {
    const roles = manageableRoles(req.user?.role);
    if (!roles.length) return res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý người dùng' });
    const placeholders = roles.map(() => '?').join(',');
    const [rows] = await db.promise().query(
      `SELECT u.id, u.username, u.full_name, u.role, u.status, u.created_at,
              w.id AS worker_id, w.worker_code, w.phone, w.department,
              w.position, w.training_percent, w.status AS worker_status
       FROM users u
       LEFT JOIN workers w ON w.user_id = u.id
       WHERE u.role IN (${placeholders})
       ORDER BY FIELD(u.role,'manager','lead','worker'), u.full_name, u.username`,
      roles
    );
    return res.json({ success: true, data: rows, allowed_roles: roles });
  } catch (error) {
    return publicError(res, error, 'Không thể lấy danh sách người dùng');
  }
};

exports.getUserById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID người dùng không hợp lệ' });
    const roles = manageableRoles(req.user?.role);
    const [rows] = await db.promise().query(
      `SELECT u.id,u.username,u.full_name,u.role,u.status,w.id worker_id,w.worker_code,w.phone,w.department,w.position,w.training_percent
       FROM users u LEFT JOIN workers w ON w.user_id=u.id WHERE u.id=? LIMIT 1`, [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Người dùng không tồn tại' });
    if (!roles.includes(rows[0].role)) return res.status(403).json({ success: false, message: 'Bạn không có quyền xem người dùng này' });
    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    return publicError(res, error, 'Không thể lấy thông tin người dùng');
  }
};

exports.createUser = async (req, res) => {
  const connection = await db.promise().getConnection();
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const fullName = String(req.body?.full_name || '').trim();
    const role = String(req.body?.role || '').trim();
    const allowed = manageableRoles(req.user?.role);

    if (!username || !fullName || password.length < 6 || !role) {
      return res.status(400).json({ success: false, message: 'Tên đăng nhập, họ tên, vai trò và mật khẩu tối thiểu 6 ký tự là bắt buộc' });
    }
    if (!allowed.includes(role)) {
      return res.status(403).json({ success: false, message: `Bạn không được tạo tài khoản vai trò ${role}` });
    }

    const workerCode = String(req.body?.worker_code || '').trim();
    if (role === 'worker' && !workerCode) {
      return res.status(400).json({ success: false, message: 'Mã công nhân là bắt buộc khi tạo công nhân' });
    }
    const trainingPercent = req.body?.training_percent === '' || req.body?.training_percent == null ? 100 : Number(req.body.training_percent);
    if (role === 'worker' && (!Number.isFinite(trainingPercent) || trainingPercent < 0 || trainingPercent > 100)) {
      return res.status(400).json({ success: false, message: '% học việc phải từ 0 đến 100' });
    }

    await connection.beginTransaction();
    const hash = await bcrypt.hash(password, 10);
    const [userResult] = await connection.query(
      'INSERT INTO users (username,password,full_name,role,status) VALUES (?,?,?,?,?)',
      [username, hash, fullName, role, normalizeStatus(req.body?.status)]
    );
    if (role === 'worker') {
      await connection.query(
        `INSERT INTO workers (user_id,worker_code,phone,department,position,training_percent,status)
         VALUES (?,?,?,?,?,?,?)`,
        [userResult.insertId, workerCode, req.body?.phone || null, req.body?.department || 'Sản xuất', req.body?.position || 'Công nhân', trainingPercent, normalizeStatus(req.body?.status)]
      );
    }
    await connection.commit();
    return res.status(201).json({ success: true, message: `Tạo ${role === 'worker' ? 'công nhân' : role === 'lead' ? 'tổ trưởng' : 'quản lý'} thành công`, data: { user_id: userResult.insertId } });
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Tên đăng nhập hoặc mã công nhân đã tồn tại' });
    return publicError(res, error, 'Không thể tạo người dùng');
  } finally {
    connection.release();
  }
};

exports.updateUser = async (req, res) => {
  const connection = await db.promise().getConnection();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID người dùng không hợp lệ' });
    const [found] = await connection.query('SELECT id,role FROM users WHERE id=? LIMIT 1', [id]);
    if (!found.length) return res.status(404).json({ success: false, message: 'Người dùng không tồn tại' });
    if (!manageableRoles(req.user?.role).includes(found[0].role)) return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa người dùng này' });

    const payload = {};
    if ('username' in (req.body || {})) payload.username = String(req.body.username || '').trim();
    if ('full_name' in (req.body || {})) payload.full_name = String(req.body.full_name || '').trim();
    if ('status' in (req.body || {})) payload.status = normalizeStatus(req.body.status);
    if (req.body?.password) {
      if (String(req.body.password).length < 6) return res.status(400).json({ success: false, message: 'Mật khẩu tối thiểu 6 ký tự' });
      payload.password = await bcrypt.hash(String(req.body.password), 10);
    }
    if (!payload.username && 'username' in payload) return res.status(400).json({ success: false, message: 'Tên đăng nhập không được để trống' });
    if (!payload.full_name && 'full_name' in payload) return res.status(400).json({ success: false, message: 'Họ tên không được để trống' });
    if (!Object.keys(payload).length) return res.status(400).json({ success: false, message: 'Không có dữ liệu cập nhật' });

    await connection.beginTransaction();
    await connection.query('UPDATE users SET ? WHERE id=?', [payload, id]);
    if (found[0].role === 'worker' && 'status' in payload) await connection.query('UPDATE workers SET status=? WHERE user_id=?', [payload.status, id]);
    await connection.commit();
    return res.json({ success: true, message: 'Cập nhật người dùng thành công' });
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Tên đăng nhập đã tồn tại' });
    return publicError(res, error, 'Không thể cập nhật người dùng');
  } finally {
    connection.release();
  }
};
