const {createUserAccount}=require('../services/userAccountWriteService');
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');
const db = require('../config/db');
const { clearWorkerProfile } = require('../utils/workerProfileCache');
const { deleteCachedAuthUser } = require('../utils/authUserCache');
const { revokeAllUserFamilies } = require('../services/refreshSessionService');
const { assertUserManagementScope } = require('../services/processAuthorizationService');

const {manageableRoles,normalizeStatus,normalizeProcessIds}=require('../domain/userManagementPolicy');
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

const {getActorProcessIds,validateProcessAssignment,replaceProcessAssignments}=require('../services/userProcessAssignmentService');

async function canManageTarget(connection, actor, target) {
  try {
    await assertUserManagementScope(actor, target, { executor: connection, action:'USER_MANAGEMENT' });
    return true;
  } catch (_) {
    return false;
  }

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
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorId = Number(req.user?.id);
    const params = [actorRole, actorId, actorRole, actorId, actorRole, actorId, actorRole, actorId, ...roles];
    let scope = '';
    if (actorRole !== 'admin') {
      scope = `AND EXISTS (SELECT 1 FROM manager_processes actor_mp WHERE actor_mp.manager_id=? AND actor_mp.process_id IN (SELECT wp2.process_id FROM worker_processes wp2 WHERE u.role='worker' AND wp2.worker_id=w.id UNION SELECT mp2.process_id FROM manager_processes mp2 WHERE u.role IN ('manager','lead') AND mp2.manager_id=u.id))`;
      params.push(actorId);
    }
    const [rows] = await db.promise().query(
      `SELECT u.id,u.username,u.full_name,u.role,w.position AS position,u.status,u.created_at,w.id AS worker_id,w.worker_code,w.phone,w.department,w.training_percent,w.status AS worker_status,
       CASE WHEN u.role='worker' THEN (SELECT GROUP_CONCAT(wp2.process_id ORDER BY wp2.process_id) FROM worker_processes wp2 WHERE wp2.worker_id=w.id AND (?='admin' OR EXISTS (SELECT 1 FROM manager_processes actor_scope WHERE actor_scope.manager_id=? AND actor_scope.process_id=wp2.process_id))) ELSE (SELECT GROUP_CONCAT(mp2.process_id ORDER BY mp2.process_id) FROM manager_processes mp2 WHERE mp2.manager_id=u.id AND (?='admin' OR EXISTS (SELECT 1 FROM manager_processes actor_scope WHERE actor_scope.manager_id=? AND actor_scope.process_id=mp2.process_id))) END AS process_ids,
       CASE WHEN u.role='worker' THEN (SELECT GROUP_CONCAT(p2.process_name ORDER BY wp2.process_id SEPARATOR ', ') FROM worker_processes wp2 JOIN processes p2 ON p2.id=wp2.process_id WHERE wp2.worker_id=w.id AND (?='admin' OR EXISTS (SELECT 1 FROM manager_processes actor_scope WHERE actor_scope.manager_id=? AND actor_scope.process_id=wp2.process_id))) ELSE (SELECT GROUP_CONCAT(p2.process_name ORDER BY mp2.process_id SEPARATOR ', ') FROM manager_processes mp2 JOIN processes p2 ON p2.id=mp2.process_id WHERE mp2.manager_id=u.id AND (?='admin' OR EXISTS (SELECT 1 FROM manager_processes actor_scope WHERE actor_scope.manager_id=? AND actor_scope.process_id=mp2.process_id))) END AS process_names
       FROM users u LEFT JOIN workers w ON w.user_id=u.id WHERE u.role IN (${placeholders}) ${scope} ORDER BY FIELD(u.role,'manager','lead','worker'),u.full_name,u.username`, params
    );
    let managerCountSql = "SELECT COUNT(DISTINCT u.id) AS manager_count FROM users u JOIN manager_processes mp ON mp.manager_id=u.id WHERE u.role='manager'";
    const managerCountParams = [];
    if (req.user.role !== 'admin') {
      managerCountSql += ' AND mp.process_id IN (SELECT process_id FROM manager_processes WHERE manager_id=?)';
      managerCountParams.push(req.user.id);
    }
    const [[managerCountRow]] = await db.promise().query(managerCountSql, managerCountParams);
    return res.json({ success:true, data:rows, allowed_roles:roles, manager_count:Number(managerCountRow?.manager_count || 0) });
  } catch (error) { return publicError(res, error, 'Không thể lấy danh sách người dùng'); }
};

exports.getUserById = async (req, res) => {
  const connection = await db.promise().getConnection();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success:false, message:'ID người dùng không hợp lệ' });
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorId = Number(req.user?.id);
    const [rows] = await connection.query(
      `SELECT u.id,u.username,u.full_name,u.role,w.position AS position,u.status,w.id worker_id,w.worker_code,w.phone,w.department,w.training_percent,
       CASE WHEN u.role='worker' THEN (SELECT GROUP_CONCAT(wp2.process_id ORDER BY wp2.process_id) FROM worker_processes wp2 WHERE wp2.worker_id=w.id AND (?='admin' OR EXISTS (SELECT 1 FROM manager_processes actor_scope WHERE actor_scope.manager_id=? AND actor_scope.process_id=wp2.process_id))) ELSE (SELECT GROUP_CONCAT(mp2.process_id ORDER BY mp2.process_id) FROM manager_processes mp2 WHERE mp2.manager_id=u.id AND (?='admin' OR EXISTS (SELECT 1 FROM manager_processes actor_scope WHERE actor_scope.manager_id=? AND actor_scope.process_id=mp2.process_id))) END AS process_ids,
       CASE WHEN u.role='worker' THEN (SELECT GROUP_CONCAT(p2.process_name ORDER BY wp2.process_id SEPARATOR ', ') FROM worker_processes wp2 JOIN processes p2 ON p2.id=wp2.process_id WHERE wp2.worker_id=w.id AND (?='admin' OR EXISTS (SELECT 1 FROM manager_processes actor_scope WHERE actor_scope.manager_id=? AND actor_scope.process_id=wp2.process_id))) ELSE (SELECT GROUP_CONCAT(p2.process_name ORDER BY mp2.process_id SEPARATOR ', ') FROM manager_processes mp2 JOIN processes p2 ON p2.id=mp2.process_id WHERE mp2.manager_id=u.id AND (?='admin' OR EXISTS (SELECT 1 FROM manager_processes actor_scope WHERE actor_scope.manager_id=? AND actor_scope.process_id=mp2.process_id))) END AS process_names
       FROM users u LEFT JOIN workers w ON w.user_id=u.id WHERE u.id=? LIMIT 1`, [actorRole,actorId,actorRole,actorId,actorRole,actorId,actorRole,actorId,id]
    );
    if (!rows.length) return res.status(404).json({ success:false, message:'Người dùng không tồn tại' });
    if (!await canManageTarget(connection, req.user, rows[0])) return res.status(403).json({ success:false, message:'Bạn không có quyền xem người dùng này' });
    const detail = { ...rows[0], process_ids: parseProcessIds(rows[0].process_ids) };
    return res.json({ success:true, data:detail });
  } catch (error) { return publicError(res, error, 'Không thể lấy thông tin người dùng'); }
  finally { connection.release(); }
};

exports.createUser = async (req,res,next) => {
  try {
    const result=await createUserAccount({actor:req.user,body:req.body});
    return res.status(result.status).json(result.payload);
  }catch(error){return next(error);}
};
