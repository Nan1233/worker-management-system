const bcrypt = require('bcrypt');
const db = require('../config/db');
const { clearWorkerProfile } = require('../utils/workerProfileCache');
const { deleteCachedAuthUser } = require('../utils/authUserCache');
const { revokeAllUserFamilies } = require('../services/refreshSessionService');

const ROLE_CREATE_RULES = { admin: ['manager','lead','worker'], manager: ['lead','worker'], lead: ['worker'] };
const manageableRoles = (role) => ROLE_CREATE_RULES[role] || [];
const normalizeStatus = (value) => value === 'inactive' ? 'inactive' : 'active';
const normalizeProcessIds = (value) => [...new Set((Array.isArray(value) ? value : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
const buildUpdateSet = (payload) => { const entries = Object.entries(payload || {}); if (!entries.length) return null; return { sql: entries.map(([field]) => `\`${field.replace(/`/g,'``')}\`=?`).join(','), values: entries.map(([,value]) => value) }; };

async function getActorProcessIds(connection, actor) {
  if (actor?.role === 'admin') return null;
  const [rows] = await connection.query('SELECT process_id FROM manager_processes WHERE manager_id=?',[actor?.id]);
  return rows.map(r => Number(r.process_id));
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
  const [rows] = await connection.query(`SELECT 1 FROM ${table} WHERE ${idField}=? AND process_id IN (${actorProcessIds.map(()=>'?').join(',')}) LIMIT 1`,[targetId,...actorProcessIds]);
  return rows.length > 0;
}
async function validateProcessAssignment(connection, actor, processIds) {
  if (!processIds.length) throw Object.assign(new Error('Phải phân ít nhất một công đoạn'),{status:400});
  const [valid] = await connection.query(`SELECT id FROM processes WHERE id IN (${processIds.map(()=>'?').join(',')}) AND status='active'`,processIds);
  if (new Set(valid.map(r=>Number(r.id))).size !== processIds.length) throw Object.assign(new Error('Có công đoạn không tồn tại hoặc đã ngừng sử dụng'),{status:400});
  const actorProcessIds = await getActorProcessIds(connection,actor);
  if (actorProcessIds && processIds.some(id=>!actorProcessIds.includes(id))) throw Object.assign(new Error('Bạn không được phân công đoạn ngoài phạm vi phụ trách'),{status:403});
}
async function replaceProcessAssignments(connection, role, userId, workerId, processIds) {
  if (role === 'worker') {
    if (!workerId) throw Object.assign(new Error('Tài khoản công nhân chưa có hồ sơ công nhân'),{status:400});
    await connection.query('DELETE FROM worker_processes WHERE worker_id=?',[workerId]);
    for (const processId of processIds) await connection.query('INSERT INTO worker_processes (worker_id, process_id) VALUES (?, ?)',[workerId,processId]);
    return;
  }
  await connection.query('DELETE FROM manager_processes WHERE manager_id=?',[userId]);
  for (const processId of processIds) await connection.query('INSERT INTO manager_processes (manager_id, process_id) VALUES (?, ?)',[userId,processId]);
}

exports.updateUser = async (req,res) => {
  const connection = await db.promise().getConnection();
  try {
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({success:false,message:'ID người dùng không hợp lệ'});
    const [found]=await connection.query('SELECT u.id,u.role,w.id AS worker_id FROM users u LEFT JOIN workers w ON w.user_id=u.id WHERE u.id=? LIMIT 1',[id]);
    if(!found.length)return res.status(404).json({success:false,message:'Người dùng không tồn tại'});
    if(!await canManageTarget(connection,req.user,found[0]))return res.status(403).json({success:false,message:'Bạn không có quyền sửa người dùng này'});
    const body=req.body||{};
    const payload={};
    if('username'in body)payload.username=String(body.username||'').trim();
    if('full_name'in body)payload.full_name=String(body.full_name||'').trim();
    if('status'in body)payload.status=normalizeStatus(body.status);
    if(body.password){if(String(body.password).length<6)return res.status(400).json({success:false,message:'Mật khẩu tối thiểu 6 ký tự'});payload.password=await bcrypt.hash(String(body.password),10);}
    if('username'in payload&&!payload.username)return res.status(400).json({success:false,message:'Tên đăng nhập không được để trống'});
    if('full_name'in payload&&!payload.full_name)return res.status(400).json({success:false,message:'Họ tên không được để trống'});
    const workerPayload={};
    if(found[0].role==='worker'){
      for(const field of ['worker_code','phone','department','position','training_percent'])if(Object.prototype.hasOwnProperty.call(body,field))workerPayload[field]=body[field]===''?null:body[field];
      if('training_percent'in workerPayload){const value=Number(workerPayload.training_percent);if(!Number.isFinite(value)||value<0||value>100)return res.status(400).json({success:false,message:'% học việc phải từ 0 đến 100'});workerPayload.training_percent=value;}
    }
    const processIdsProvided=Array.isArray(body.process_ids);
    const processIds=processIdsProvided?normalizeProcessIds(body.process_ids):[];
    if(!Object.keys(payload).length&&!Object.keys(workerPayload).length&&!processIdsProvided)return res.status(400).json({success:false,message:'Không có dữ liệu cập nhật'});
    if(processIdsProvided)await validateProcessAssignment(connection,req.user,processIds);
    if(Object.keys(payload).length){const update=buildUpdateSet(payload);await connection.query(`UPDATE users SET ${update.sql} WHERE id=?`,[...update.values,id]);}
    if(found[0].role==='worker'&&'status'in payload)workerPayload.status=payload.status;
    if(found[0].role==='worker'&&Object.keys(workerPayload).length){const update=buildUpdateSet(workerPayload);await connection.query(`UPDATE workers SET ${update.sql} WHERE user_id=?`,[...update.values,id]);}
    if(processIdsProvided)await replaceProcessAssignments(connection,found[0].role,id,found[0].worker_id,processIds);
    if(Object.prototype.hasOwnProperty.call(payload,'password')||payload.status==='inactive')await revokeAllUserFamilies(id,{executor:connection});
    clearWorkerProfile(id);deleteCachedAuthUser(id);
    return res.json({success:true,message:'Cập nhật người dùng thành công'});
  } catch(error){
    if(error?.code==='ER_DUP_ENTRY')return res.status(409).json({success:false,message:'Tên đăng nhập hoặc mã công nhân đã tồn tại'});
    if(error?.status)return res.status(error.status).json({success:false,message:error.message});
    console.error('UPDATE USER ERROR:',error);
    return res.status(500).json({success:false,message:`TiDB query failed: ${error?.message||'Không thể cập nhật người dùng'}`});
  } finally { connection.release(); }
};
