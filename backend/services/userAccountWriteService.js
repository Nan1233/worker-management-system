'use strict';
const bcrypt=require('bcrypt');
const db=require('../config/db');
const {clearWorkerProfile}=require('../utils/workerProfileCache');
const {deleteCachedAuthUser}=require('../utils/authUserCache');
const {revokeAllUserFamilies}=require('./refreshSessionService');
const {manageableRoles,normalizeStatus,normalizeProcessIds}=require('../domain/userManagementPolicy');
const {getActorProcessIds,validateProcessAssignment,replaceProcessAssignments}=require('./userProcessAssignmentService');

function buildUpdateSet(payload) {
  const entries = Object.entries(payload || {});
  if (!entries.length) return null;
  return {
    sql: entries.map(([field]) => `\`${field.replace(/`/g, '``')}\`=?`).join(','),
    values: entries.map(([, value]) => value),
  };
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
  const [rows] = await connection.query(
    `SELECT 1 FROM ${table} WHERE ${idField}=? AND process_id IN (${actorProcessIds.map(() => '?').join(',')}) LIMIT 1`,
    [targetId, ...actorProcessIds],
  );
  return rows.length > 0;
}

async function createUserAccount({actor,body}) {
  const connection = await db.promise().getConnection();
  try {
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');
    const fullName = String(body?.full_name || '').trim();
    const role = String(body?.role || '').trim();
    if (!username || !fullName || password.length < 6 || !role) return {status:400,payload:{ success:false, message:'Tên đăng nhập, họ tên, vai trò và mật khẩu tối thiểu 6 ký tự là bắt buộc' }};
    if (!manageableRoles(actor?.role).includes(role)) return {status:403,payload:{ success:false, message:`Bạn không được tạo tài khoản vai trò ${role}` }};
    const workerCode = String(body?.worker_code || '').trim();
    if (role === 'worker' && !workerCode) return {status:400,payload:{ success:false, message:'Mã công nhân là bắt buộc khi tạo công nhân' }};
    const trainingPercent = body?.training_percent === '' || body?.training_percent == null ? 100 : Number(body.training_percent);
    if (role === 'worker' && (!Number.isFinite(trainingPercent) || trainingPercent < 0 || trainingPercent > 100)) return {status:400,payload:{ success:false, message:'% học việc phải từ 0 đến 100' }};
    const processIds = normalizeProcessIds(body?.process_ids);
    await connection.beginTransaction();
    await validateProcessAssignment(connection, actor, processIds, true);

    const [usernameRows] = await connection.query(
      `SELECT id,username,full_name,role,status FROM users WHERE username=? LIMIT 1`,
      [username]
    );
    if (usernameRows.length) {
      await connection.rollback();
      const existing = usernameRows[0];
      const roleLabel = existing.role === 'admin' ? 'quản trị viên' : existing.role === 'manager' ? 'quản lý' : existing.role === 'lead' ? 'tổ trưởng' : 'công nhân';
      return {status:409,payload:{ success:false, code:'USERNAME_ALREADY_EXISTS', message:`Tên đăng nhập "${username}" đã được sử dụng bởi tài khoản ${roleLabel}${existing.full_name ? ` (${existing.full_name})` : ''}. Vui lòng dùng tên đăng nhập khác.` }};
    }

    if (role === 'worker') {
      const [workerCodeRows] = await connection.query(
        `SELECT w.id,w.worker_code,u.username,u.full_name,u.role FROM workers w LEFT JOIN users u ON u.id=w.user_id WHERE w.worker_code=? LIMIT 1`,
        [workerCode]
      );
      if (workerCodeRows.length) {
        await connection.rollback();
        const existing = workerCodeRows[0];
        return {status:409,payload:{ success:false, code:'WORKER_CODE_ALREADY_EXISTS', message:`Mã công nhân "${workerCode}" đã tồn tại${existing.full_name ? ` (${existing.full_name})` : ''}${existing.username ? ` với tài khoản "${existing.username}"` : ''}. Vui lòng kiểm tra lại.` }};
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const [userResult] = await connection.query('INSERT INTO users (username,password,full_name,role,status) VALUES (?,?,?,?,?)', [username,hash,fullName,role,normalizeStatus(body?.status)]);
    let workerId = null;
    if (role === 'worker') {
      const [workerResult] = await connection.query(`INSERT INTO workers (user_id,worker_code,phone,department,position,training_percent,status) VALUES (?,?,?,?,?,?,?)`, [userResult.insertId,workerCode,body?.phone || null,body?.department || 'Sản xuất',body?.position || 'Công nhân',trainingPercent,normalizeStatus(body?.status)]);
      workerId = workerResult.insertId;
    }
    await replaceProcessAssignments(connection, role, userResult.insertId, workerId, processIds);
    await connection.commit();
    return {status:201,payload:{ success:true, message:'Đã tạo tài khoản' }};
  } catch (error) {
    try { await connection.rollback(); } catch {}
    if (error?.status) return {status:error.status,payload:{ success:false, message:error.message }};
    if (error?.code === 'ER_DUP_ENTRY') return {status:409,payload:{ success:false, code:'DUPLICATE_USER_DATA', message:'Tên đăng nhập hoặc mã công nhân đã tồn tại. Vui lòng kiểm tra lại.' }};
    console.error('Không thể tạo tài khoản', error);
    return {status:500,payload:{success:false,message:'Không thể tạo tài khoản'}};
  } finally {
    connection.release();
  }
}
async function updateUserAccount({actor,body,userId}) {
  const connection = await db.promise().getConnection();
  try {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return {status:400,payload:{ success: false, message: 'ID người dùng không hợp lệ' }};
    const [found] = await connection.query(
      'SELECT u.id,u.role,w.id AS worker_id FROM users u LEFT JOIN workers w ON w.user_id=u.id WHERE u.id=? LIMIT 1',
      [id],
    );
    if (!found.length) return {status:404,payload:{ success: false, message: 'Người dùng không tồn tại' }};
    if (!await canManageTarget(connection, actor, found[0])) return {status:403,payload:{ success: false, message: 'Bạn không có quyền sửa người dùng này' }};

    const payload = {};
    if ('username' in (body || {})) payload.username = String(body.username || '').trim();
    if ('full_name' in (body || {})) payload.full_name = String(body.full_name || '').trim();
    if ('status' in (body || {})) payload.status = normalizeStatus(body.status);
    if (body?.password) {
      if (String(body.password).length < 6) return {status:400,payload:{ success: false, message: 'Mật khẩu tối thiểu 6 ký tự' }};
      payload.password = await bcrypt.hash(String(body.password), 10);
    }
    if ('username' in payload && !payload.username) return {status:400,payload:{ success: false, message: 'Tên đăng nhập không được để trống' }};
    if ('full_name' in payload && !payload.full_name) return {status:400,payload:{ success: false, message: 'Họ tên không được để trống' }};

    const workerPayload = {};
    if (found[0].role === 'worker') {
      for (const field of ['worker_code','phone','department','position','training_percent']) {
        if (Object.prototype.hasOwnProperty.call(body || {}, field)) {
          workerPayload[field] = body[field] === '' ? null : body[field];
        }
      }
      if ('training_percent' in workerPayload) {
        const value = Number(workerPayload.training_percent);
        if (!Number.isFinite(value) || value < 0 || value > 100) return {status:400,payload:{ success:false, message:'% học việc phải từ 0 đến 100' }};
        workerPayload.training_percent = value;
      }
    }
    const processIdsProvided = Array.isArray(body?.process_ids);
    const processIds = processIdsProvided ? normalizeProcessIds(body.process_ids) : [];
    if (!Object.keys(payload).length && !Object.keys(workerPayload).length && !processIdsProvided) return {status:400,payload:{ success: false, message: 'Không có dữ liệu cập nhật' }};

    await connection.beginTransaction();
    if (processIdsProvided) await validateProcessAssignment(connection, actor, processIds, true);
    if (Object.keys(payload).length) {
      const update = buildUpdateSet(payload);
      await connection.query(`UPDATE users SET ${update.sql} WHERE id=?`, [...update.values, id]);
    }
    if (found[0].role === 'worker' && 'status' in payload) workerPayload.status = payload.status;
    if (found[0].role === 'worker' && Object.keys(workerPayload).length) {
      const update = buildUpdateSet(workerPayload);
      await connection.query(`UPDATE workers SET ${update.sql} WHERE user_id=?`, [...update.values, id]);
    }
    if (processIdsProvided) await replaceProcessAssignments(connection, found[0].role, id, found[0].worker_id, processIds);
    if (Object.prototype.hasOwnProperty.call(payload, 'password') || payload.status === 'inactive') {
      await revokeAllUserFamilies(id, { executor: connection });
    }
    await connection.commit();
    clearWorkerProfile(id);
    deleteCachedAuthUser(id);
    return {status:200,payload:{ success: true, message: 'Cập nhật người dùng thành công' }};
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    if (error?.code === 'ER_DUP_ENTRY') return {status:409,payload:{ success: false, message: 'Tên đăng nhập hoặc mã công nhân đã tồn tại' }};
    if (error?.status) return {status:error.status,payload:{ success:false, message:error.message }};
    console.error('Không thể cập nhật người dùng', error);
    return {status:500,payload:{success:false,message:'Không thể cập nhật người dùng'}};
  } finally { connection.release(); }
}

module.exports={createUserAccount,updateUserAccount,canManageTarget,buildUpdateSet};
