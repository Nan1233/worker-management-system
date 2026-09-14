const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');
const db = require('../config/db');
const { clearWorkerProfile } = require('../utils/workerProfileCache');
const { deleteCachedAuthUser } = require('../utils/authUserCache');
const { revokeAllUserFamilies } = require('../services/refreshSessionService');

const ROLE_CREATE_RULES = {
  admin: ['manager', 'lead', 'worker'],
  manager: ['lead', 'worker'],
  lead: ['worker']
};

const manageableRoles = (role) => ROLE_CREATE_RULES[role] || [];
const normalizeStatus = (value) => value === 'inactive' ? 'inactive' : 'active';
const normalizeProcessIds = (value) => [...new Set((Array.isArray(value) ? value : [])
  .map(Number).filter((id) => Number.isInteger(id) && id > 0))];
const parseProcessIds = (value) => {
  if (Array.isArray(value)) return normalizeProcessIds(value);
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeProcessIds(parsed);
  } catch (_) {}
  return normalizeProcessIds(raw.split(','));
};

function publicError(res, error, fallback) {
  console.error(fallback, error);
  return res.status(500).json({ success: false, message: fallback });
}

async function getActorProcessIds(connection, actor) {
  if (actor?.role === 'admin') return null;
  const [rows] = await connection.query('SELECT process_id FROM manager_processes WHERE manager_id=?', [actor?.id]);
  return rows.map((row) => Number(row.process_id));
}

async function validateProcessAssignment(connection, actor, processIds, required = true) {
  if (required && processIds.length === 0) {
    const error = new Error('Phải phân ít nhất một công đoạn');
    error.status = 400;
    throw error;
  }
  if (!processIds.length) return;
  const [valid] = await connection.query(`SELECT id FROM processes WHERE id IN (${processIds.map(() => '?').join(',')}) AND status='active'`, processIds);
  if (valid.length !== processIds.length) {
    const error = new Error('Có công đoạn không tồn tại hoặc đã ngừng sử dụng');
    error.status = 400;
    throw error;
  }
  const actorProcessIds = await getActorProcessIds(connection, actor);
  if (actorProcessIds && processIds.some((id) => !actorProcessIds.includes(id))) {
    const error = new Error('Bạn không được phân công đoạn ngoài phạm vi phụ trách');
    error.status = 403;
    throw error;
  }
}

async function canManageTarget(connection, actor, target) {
  if (!manageableRoles(actor?.role).includes(target.role)) return false;
  if (actor.role === 'admin') return true;
  const actorProcessIds = await getActorProcessIds(connection, actor);
  if (!actorProcessIds?.length) return false;
  const table = target.role === 'worker' ? 'worker_processes' : 'manager_processes';
  const idField = target.role === 'worker' ? 'worker_id' : 'manager_id';
  const targetId = target.role === 'worker' ? target.worker_id : target.id;
  if (!targetId) return false;
  const [rows] = await connection.query(`SELECT 1 FROM ${table} WHERE ${idField}=? AND process_id IN (${actorProcessIds.map(() => '?').join(',')}) LIMIT 1`, [targetId, ...actorProcessIds]);
  return rows.length > 0;
}

async function replaceProcessAssignments(connection, role, userId, workerId, processIds) {
  if (role === 'worker') {
    await connection.query('DELETE FROM worker_processes WHERE worker_id=?', [workerId]);
    if (processIds.length) await connection.query('INSERT INTO worker_processes (worker_id,process_id) VALUES ?', [processIds.map((processId) => [workerId, processId])]);
    return;
  }
  await connection.query('DELETE FROM manager_processes WHERE manager_id=?', [userId]);
  if (processIds.length) await connection.query('INSERT INTO manager_processes (manager_id,process_id) VALUES ?', [processIds.map((processId) => [userId, processId])]);
}

exports.getProcessOptions = async (req, res) => {
  try {
    const params = [];
    let scope = '';
    if (req.user?.role !== 'admin') {
      scope = 'AND EXISTS (SELECT 1 FROM manager_processes mp WHERE mp.manager_id=? AND mp.process_id=p.id)';
      params.push(req.user.id);
    }
    const [rows] = await db.promise().query(`SELECT p.id, p.process_code, p.process_name FROM processes p WHERE p.status='active' ${scope} ORDER BY CASE WHEN p.process_code='GC' OR LOWER(p.process_name) IN ('gia công','cắt lồng','cắt / lồng') THEN 0 ELSE 1 END, p.process_name`, params);
    const normalized = [];
    const seen = new Set();
    for (const row of rows) {
      const code = String(row.process_code || '').trim().toUpperCase();
      const plainName = String(row.process_name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const isGiaCong = ['GC', 'CAT_LONG', 'CATLONG', 'GIA_CONG'].includes(code) || plainName.includes('gia cong') || (plainName.includes('cat') && plainName.includes('long'));
      const canonicalKey = isGiaCong ? 'GC' : code || `ID_${row.id}`;
      if (seen.has(canonicalKey)) continue;
      seen.add(canonicalKey);
      normalized.push({ ...row, id: Number(row.id), process_code: isGiaCong ? 'GC' : row.process_code, process_name: isGiaCong ? 'Gia công' : row.process_name });
    }
    return res.json({ success: true, data: normalized });
  } catch (error) { return publicError(res, error, 'Không thể lấy danh sách công đoạn'); }
};

exports.getAllUsers = async (req, res) => {
  try {
    const roles = manageableRoles(req.user?.role);
    if (!roles.length) return res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý người dùng' });
    const placeholders = roles.map(() => '?').join(',');
    const params = [...roles];
    let scope = '';
    if (req.user.role !== 'admin') {
      scope = `AND EXISTS (SELECT 1 FROM manager_processes actor_mp WHERE actor_mp.manager_id=? AND actor_mp.process_id IN (SELECT wp2.process_id FROM worker_processes wp2 WHERE u.role='worker' AND wp2.worker_id=w.id UNION SELECT mp2.process_id FROM manager_processes mp2 WHERE u.role IN ('manager','lead') AND mp2.manager_id=u.id))`;
      params.push(req.user.id);
    }
    const [rows] = await db.promise().query(
      `SELECT u.id,u.username,u.full_name,u.role,u.status,u.created_at,w.id AS worker_id,w.worker_code,w.phone,w.department,w.position,w.training_percent,w.status AS worker_status,
       CASE WHEN u.role='worker' THEN (SELECT GROUP_CONCAT(wp2.process_id ORDER BY wp2.process_id) FROM worker_processes wp2 WHERE wp2.worker_id=w.id) ELSE (SELECT GROUP_CONCAT(mp2.process_id ORDER BY mp2.process_id) FROM manager_processes mp2 WHERE mp2.manager_id=u.id) END AS process_ids,
       CASE WHEN u.role='worker' THEN (SELECT GROUP_CONCAT(p2.process_name ORDER BY wp2.process_id SEPARATOR ', ') FROM worker_processes wp2 JOIN processes p2 ON p2.id=wp2.process_id WHERE wp2.worker_id=w.id) ELSE (SELECT GROUP_CONCAT(p2.process_name ORDER BY mp2.process_id SEPARATOR ', ') FROM manager_processes mp2 JOIN processes p2 ON p2.id=mp2.process_id WHERE mp2.manager_id=u.id) END AS process_names
       FROM users u LEFT JOIN workers w ON w.user_id=u.id WHERE u.role IN (${placeholders}) ${scope} ORDER BY FIELD(u.role,'manager','lead','worker'),u.full_name,u.username`, params
    );
    const [[managerCountRow]] = await db.promise().query(`SELECT COUNT(*) AS manager_count FROM users WHERE role='manager'`);
    return res.json({ success:true, data:rows, allowed_roles:roles, manager_count:Number(managerCountRow?.manager_count || 0) });
  } catch (error) { return publicError(res, error, 'Không thể lấy danh sách người dùng'); }
};

exports.getUserById = async (req, res) => {
  const connection = await db.promise().getConnection();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success:false, message:'ID người dùng không hợp lệ' });
    const [rows] = await connection.query(
      `SELECT u.id,u.username,u.full_name,u.role,u.status,w.id worker_id,w.worker_code,w.phone,w.department,w.position,w.training_percent,
       CASE WHEN u.role='worker' THEN (SELECT GROUP_CONCAT(wp2.process_id ORDER BY wp2.process_id) FROM worker_processes wp2 WHERE wp2.worker_id=w.id) ELSE (SELECT GROUP_CONCAT(mp2.process_id ORDER BY mp2.process_id) FROM manager_processes mp2 WHERE mp2.manager_id=u.id) END AS process_ids,
       CASE WHEN u.role='worker' THEN (SELECT GROUP_CONCAT(p2.process_name ORDER BY wp2.process_id SEPARATOR ', ') FROM worker_processes wp2 JOIN processes p2 ON p2.id=wp2.process_id WHERE wp2.worker_id=w.id) ELSE (SELECT GROUP_CONCAT(p2.process_name ORDER BY mp2.process_id SEPARATOR ', ') FROM manager_processes mp2 JOIN processes p2 ON p2.id=mp2.process_id WHERE mp2.manager_id=u.id) END AS process_names
       FROM users u LEFT JOIN workers w ON w.user_id=u.id WHERE u.id=? LIMIT 1`, [id]
    );
    if (!rows.length) return res.status(404).json({ success:false, message:'Người dùng không tồn tại' });
    if (!await canManageTarget(connection, req.user, rows[0])) return res.status(403).json({ success:false, message:'Bạn không có quyền xem người dùng này' });

    // Always return assignments as a real numeric array. The DB driver may expose
    // GROUP_CONCAT as a string, and the editor must not depend on driver coercion.
    const detail = { ...rows[0], process_ids: parseProcessIds(rows[0].process_ids) };
    return res.json({ success:true, data:detail });
  } catch (error) { return publicError(res, error, 'Không thể lấy thông tin người dùng'); }
  finally { connection.release(); }
};

exports.createUser = async (req, res) => {
  const connection = await db.promise().getConnection();
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const fullName = String(req.body?.full_name || '').trim();
    const role = String(req.body?.role || '').trim();
    if (!username || !fullName || password.length < 6 || !role) return res.status(400).json({ success:false, message:'Tên đăng nhập, họ tên, vai trò và mật khẩu tối thiểu 6 ký tự là bắt buộc' });
    if (!manageableRoles(req.user?.role).includes(role)) return res.status(403).json({ success:false, message:`Bạn không được tạo tài khoản vai trò ${role}` });
    const workerCode = String(req.body?.worker_code || '').trim();
    if (role === 'worker' && !workerCode) return res.status(400).json({ success:false, message:'Mã công nhân là bắt buộc khi tạo công nhân' });
    const trainingPercent = req.body?.training_percent === '' || req.body?.training_percent == null ? 100 : Number(req.body.training_percent);
    if (role === 'worker' && (!Number.isFinite(trainingPercent) || trainingPercent < 0 || trainingPercent > 100)) return res.status(400).json({ success:false, message:'% học việc phải từ 0 đến 100' });
    const processIds = normalizeProcessIds(req.body?.process_ids);
    await connection.beginTransaction();
    await validateProcessAssignment(connection, req.user, processIds, true);
    const hash = await bcrypt.hash(password, 10);
    const [userResult] = await connection.query('INSERT INTO users (username,password,full_name,role,status) VALUES (?,?,?,?,?)', [username,hash,fullName,role,normalizeStatus(req.body?.status)]);
    let workerId = null;
    if (role === 'worker') {
      const [workerResult] = await connection.query(`INSERT INTO workers (user_id,worker_code,phone,department,position,training_percent,status) VALUES (?,?,?,?,?,?,?)`, [userResult.insertId,workerCode,req.body?.phone || null,req.body?.department || 'Sản xuất',req.body?.position || 'Công nhân',trainingPercent,normalizeStatus(req.body?.status)]);
      workerId = workerResult.insertId;
    }
    await replaceProcessAssignments(connection, role, userResult.insertId, workerId, processIds);
    await connection.commit();
    return res.status(201).json({ success:true, message:'Đã tạo tài khoản' });
  } catch (error) {
    try { await db.promise().query('ROLLBACK'); } catch {}
    if (error?.status) return res.status(error.status).json({ success:false, message:error.message });
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success:false, message:'Tên đăng nhập hoặc mã công nhân đã tồn tại' });
    return publicError(res, error, 'Không thể tạo tài khoản');
  }
};
