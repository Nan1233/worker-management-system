const db = require('../config/db');
const { clearWorkerProfile } = require('../utils/workerProfileCache');
const { getActorProcessScope, assertProcessScope, assertProcessesScope, scopeSql } = require('../services/processAuthorizationService');
const { revokeAllUserFamilies } = require('../services/refreshSessionService');
const { validateMasterNumeric } = require('../services/masterNumericValidationService');

const TABLES = {
  processes: { table:'processes', fields:['process_code','process_name','description','status'], required:['process_code','process_name'], order:'process_name' },
  defects: { table:'defect_types', fields:['process_id','defect_code','defect_name','sort_order','status'], required:['process_id','defect_code','defect_name'], order:'process_id, sort_order, defect_name' },
  deductions: { table:'deduction_types', fields:['process_id','deduction_code','deduction_name','sort_order','status'], required:['process_id','deduction_code','deduction_name'], order:'process_id, sort_order, deduction_name' },
  machines: { table:'machines', fields:['process_id','machine_code','machine_name','status'], required:['process_id','machine_code','machine_name'], order:'process_id, machine_code' },
  standards: { table:'product_standards', fields:['process_id','work_type','product_code','standard_output','exclude_kqd_from_tt','status'], required:['process_id','product_code','standard_output'], order:'process_id, product_code' }
};

const PROCESS_BOUND_RESOURCES = new Set(['defects','deductions','machines','standards']);
const LEAD_MANAGER_MASTER_RESOURCES = new Set(['machines','standards','deductions']);

function authErrorResponse(res, error) {
  if (error?.status === 403 || error?.statusCode === 403) {
    return res.status(403).json({ success:false, code:error.code || 'PROCESS_SCOPE_FORBIDDEN', message:error.message });
  }
  return null;
}

async function assertMasterResourceScope(actor, cfg, id, executor) {
  if (cfg.table === 'processes') {
    await assertProcessScope(actor, id, { executor, action:'MASTER_RESOURCE' });
    return Number(id);
  }
  const [rows] = await executor.query(`SELECT id, process_id FROM ${cfg.table} WHERE id=? LIMIT 1`, [Number(id)]);
  if (!rows.length) return null;
  await assertProcessScope(actor, rows[0].process_id, { executor, action:'MASTER_RESOURCE' });
  return Number(rows[0].process_id);
}

async function assertCanManageWorker(actor, workerId, executor, { requireAllAssignments = false } = {}) {
  if (actor?.role === 'admin') return true;
  const [assigned] = await executor.query('SELECT process_id FROM worker_processes WHERE worker_id=? ORDER BY process_id', [Number(workerId)]);
  const targetIds = assigned.map((row) => Number(row.process_id)).filter(Boolean);
  if (!targetIds.length) throw Object.assign(new Error('Công nhân chưa có công đoạn thuộc phạm vi phụ trách'), { status:403, code:'PROCESS_SCOPE_FORBIDDEN' });
  const scope = await getActorProcessScope(actor, executor);
  if (scope.type === 'ALL') return true;
  const allowed = targetIds.filter((id) => scope.processIds.has(id));
  if (!allowed.length || (requireAllAssignments && allowed.length !== targetIds.length)) {
    throw Object.assign(new Error('Công nhân có phân công ngoài phạm vi phụ trách'), { status:403, code:'PROCESS_SCOPE_FORBIDDEN' });
  }
  return true;
}

function requireMasterPermission(req, res) {
  // Tổ trưởng dùng đúng 3 nhóm master như Quản lý.
  if (req.user?.role === 'lead' && !LEAD_MANAGER_MASTER_RESOURCES.has(String(req.params.resource || ''))) {
    res.status(403).json({ success:false, code:'MASTER_RESOURCE_FORBIDDEN', message:'Tổ trưởng chỉ được quản lý Máy móc, Sản phẩm và Trừ giờ' });
    return false;
  }
  return true;
}

function requireAdminForManagers(req, res) {
  if (req.params.resource === 'managers' && req.user?.role !== 'admin') {
    res.status(403).json({ success:false, message:'Chỉ quản trị viên được quản lý tài khoản manager' });
    return false;
  }
  return true;
}

function listManagers(res, next) {
  db.query(`SELECT u.id, u.username, u.full_name, u.status, u.created_at,
    GROUP_CONCAT(DISTINCT p.process_name ORDER BY p.process_name SEPARATOR ', ') AS process_names
    FROM users u
    LEFT JOIN manager_processes mp ON mp.manager_id=u.id
    LEFT JOIN processes p ON p.id=mp.process_id
    WHERE u.role='manager'
    GROUP BY u.id, u.username, u.full_name, u.status, u.created_at
    ORDER BY u.full_name, u.username`, (error, rows) => error ? next(error) : res.json({success:true,data:rows}));
}

function config(req, res) {
  const value = TABLES[req.params.resource];
  if (!value) {
    res.status(404).json({ success:false, message:'Danh mục quản trị không tồn tại' });
    return null;
  }
  return value;
}

function cleanPayload(body, cfg, partial=false) {
  const payload = {};
  for (const field of cfg.fields) {
    if (Object.prototype.hasOwnProperty.call(body || {}, field)) payload[field] = body[field];
  }
  if (!partial) {
    for (const field of cfg.required) {
      if (payload[field] === undefined || payload[field] === null || String(payload[field]).trim() === '') {
        const error = new Error(`Thiếu trường bắt buộc: ${field}`); error.status = 400; throw error;
      }
    }
  }
  if ('status' in payload && !['active','inactive'].includes(payload.status)) {
    const error = new Error('Trạng thái không hợp lệ'); error.status = 400; throw error;
  }
  if ('exclude_kqd_from_tt' in payload) payload.exclude_kqd_from_tt = validateMasterNumeric('exclude_kqd_from_tt', payload.exclude_kqd_from_tt).value;
  if ('process_id' in payload) payload.process_id = validateMasterNumeric('process_id', payload.process_id).value;
  if ('sort_order' in payload) payload.sort_order = validateMasterNumeric('sort_order', payload.sort_order).value;
  if ('standard_output' in payload) {
    try {
      payload.standard_output = validateMasterNumeric('standard_output', payload.standard_output).value;
    } catch (error) {
      if (/^MASTER_NUMERIC_/.test(String(error?.code || ''))) error.message = 'Định mức phải là số dương hợp lệ';
      throw error;
    }
  }
  return payload;
}

exports.list = async (req, res, next) => {
  try {
    if (req.params.resource === 'managers') return res.status(410).json({success:false,message:'Chức năng manager đã chuyển sang Quản lý người dùng'});
    if (!requireMasterPermission(req,res) || !requireAdminForManagers(req,res)) return;
    const cfg = config(req,res); if (!cfg) return;
    const scope = await getActorProcessScope(req.user);
    if (cfg.table === 'processes') {
      const scoped = scopeSql(scope, 't.id', []);
      const [rows] = await db.promise().query(`SELECT t.* FROM processes t WHERE 1=1 ${scoped.clause} ORDER BY ${cfg.order}`, scoped.params);
      return res.json({ success:true, data:rows });
    }
    const scoped = scopeSql(scope, 't.process_id', []);
    const [rows] = await db.promise().query(
      `SELECT t.*, p.process_code, p.process_name FROM ${cfg.table} t LEFT JOIN processes p ON p.id=t.process_id WHERE 1=1 ${scoped.clause} ORDER BY ${cfg.order}`,
      scoped.params
    );
    const data = req.params.resource === 'standards'
      ? rows.map((row) => ({ ...row, standard_output: Number(row.standard_output) }))
      : rows;
    return res.json({ success:true, data });
  } catch (error) {
    if (authErrorResponse(res,error)) return;
    next(error);
  }
};

exports.create = async (req,res,next) => {
  try {
    if (!requireMasterPermission(req,res) || !requireAdminForManagers(req,res)) return;
    if (req.params.resource === 'managers') return res.status(410).json({success:false,message:'Chức năng manager đã chuyển sang Quản lý người dùng'});
    if (false) {
      const username=String(req.body?.username||'').trim();
      const fullName=String(req.body?.full_name||'').trim();
      const password=String(req.body?.password||'');
      if(!username||!fullName||password.length<6) return res.status(400).json({success:false,message:'Username, họ tên và mật khẩu tối thiểu 6 ký tự là bắt buộc'});
      const hash=await bcrypt.hash(password,10);
      return db.query("INSERT INTO users (username,password,full_name,role,status) VALUES (?,?,?,'manager',?)",[username,hash,fullName,req.body?.status==='inactive'?'inactive':'active'],(error,result)=>{
        if(error?.code==='ER_DUP_ENTRY') return res.status(409).json({success:false,message:'Username đã tồn tại'});
        if(error) return next(error);
        res.status(201).json({success:true,message:'Tạo manager thành công',data:{id:result.insertId}});
      });
    }
    const cfg=config(req,res); if(!cfg) return;
    const payload=cleanPayload(req.body,cfg);
    if (cfg.table === 'processes' && req.user?.role !== 'admin') {
      return res.status(403).json({success:false,code:'PROCESS_SCOPE_FORBIDDEN',message:'Chỉ admin được tạo công đoạn'});
    }
    if (PROCESS_BOUND_RESOURCES.has(req.params.resource)) {
      await assertProcessScope(req.user, payload.process_id, { action:'MASTER_CREATE' });
    }
    if (req.params.resource === 'standards' && !payload.work_type);
    db.query(`INSERT INTO ${cfg.table} SET ?`, payload, (error,result) => {
      if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({success:false,message:'Mã hoặc dữ liệu đã tồn tại'});
      if (error) return next(error);
      res.status(201).json({success:true,message:'Tạo mới thành công',data:{id:result.insertId}});
    });
  } catch(error) { res.status(error.status||error.statusCode||400).json({success:false,code:error.code||undefined,message:error.message}); }
};

exports.update = async (req,res,next) => {
  try {
    if (!requireMasterPermission(req,res) || !requireAdminForManagers(req,res)) return;
    if (req.params.resource === 'managers') return res.status(410).json({success:false,message:'Chức năng manager đã chuyển sang Quản lý người dùng'});
    if (false) {
      const id=Number(req.params.id); if(!Number.isInteger(id)||id<=0) return res.status(400).json({success:false,message:'ID không hợp lệ'});
      const payload={};
      if(Object.prototype.hasOwnProperty.call(req.body||{},'username')) payload.username=String(req.body.username).trim();
      if(Object.prototype.hasOwnProperty.call(req.body||{},'full_name')) payload.full_name=String(req.body.full_name).trim();
      if(Object.prototype.hasOwnProperty.call(req.body||{},'status')) payload.status=req.body.status==='inactive'?'inactive':'active';
      if(req.body?.password){ if(String(req.body.password).length<6) return res.status(400).json({success:false,message:'Mật khẩu tối thiểu 6 ký tự'}); payload.password=await bcrypt.hash(String(req.body.password),10); }
      if(!Object.keys(payload).length) return res.status(400).json({success:false,message:'Không có dữ liệu cập nhật'});
      return db.query("UPDATE users SET ? WHERE id=? AND role='manager'",[payload,id],(error,result)=>{
        if(error?.code==='ER_DUP_ENTRY') return res.status(409).json({success:false,message:'Username đã tồn tại'});
        if(error) return next(error);
        if(!result.affectedRows) return res.status(404).json({success:false,message:'Không tìm thấy manager'});
        res.json({success:true,message:'Cập nhật manager thành công'});
      });
    }
    const cfg=config(req,res); if(!cfg) return;
    const id=Number(req.params.id); if(!Number.isInteger(id)||id<=0) return res.status(400).json({success:false,message:'ID không hợp lệ'});
    const payload=cleanPayload(req.body,cfg,true);
    if(!Object.keys(payload).length) return res.status(400).json({success:false,message:'Không có dữ liệu cập nhật'});
    if (cfg.table === 'processes' && req.user?.role !== 'admin') {
      return res.status(403).json({success:false,code:'PROCESS_SCOPE_FORBIDDEN',message:'Chỉ admin được sửa công đoạn'});
    }
    const connection = await db.promise().getConnection();
    try {
      await connection.beginTransaction();
      const existingProcessId = await assertMasterResourceScope(req.user, cfg, id, connection);
      if (existingProcessId === null) { await connection.rollback(); return res.status(404).json({success:false,message:'Không tìm thấy dữ liệu'}); }
      if ('process_id' in payload && PROCESS_BOUND_RESOURCES.has(req.params.resource)) {
        await assertProcessScope(req.user, payload.process_id, { executor:connection, action:'MASTER_UPDATE_TARGET' });
      }
      const [result] = await connection.query(`UPDATE ${cfg.table} SET ? WHERE id=?`,[payload,id]);
      await connection.commit();
      return res.json({success:true,message:'Cập nhật thành công'});
    } catch (error) {
      try { await connection.rollback(); } catch (_) {}
      if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({success:false,message:'Mã hoặc dữ liệu đã tồn tại'});
      if (authErrorResponse(res,error)) return;
      throw error;
    } finally { connection.release(); }
  } catch(error) { res.status(error.status||error.statusCode||400).json({success:false,code:error.code||undefined,message:error.message}); }
};

exports.remove = async (req,res,next) => {
  try {
    if (!requireMasterPermission(req,res) || !requireAdminForManagers(req,res)) return;
    if (req.params.resource === 'managers') return res.status(410).json({success:false,message:'Chức năng manager đã chuyển sang Quản lý người dùng'});
    const cfg=config(req,res); if(!cfg) return;
    const id=Number(req.params.id); if(!Number.isInteger(id)||id<=0) return res.status(400).json({success:false,message:'ID không hợp lệ'});
    if (cfg.table === 'processes' && req.user?.role !== 'admin') return res.status(403).json({success:false,code:'PROCESS_SCOPE_FORBIDDEN',message:'Chỉ admin được ngừng công đoạn'});
    const connection=await db.promise().getConnection();
    try {
      await connection.beginTransaction();
      const processId=await assertMasterResourceScope(req.user,cfg,id,connection);
      if(processId===null){await connection.rollback();return res.status(404).json({success:false,message:'Không tìm thấy dữ liệu'});}
      const [result]=await connection.query(`UPDATE ${cfg.table} SET status='inactive' WHERE id=?`,[id]);
      await connection.commit();
      return res.json({success:true,message:'Đã ngừng sử dụng dữ liệu'});
    } catch(error){try{await connection.rollback();}catch(_){} if(authErrorResponse(res,error))return; throw error;}
    finally{connection.release();}
  } catch(error){next(error);}
};

exports.updateWorker = async (req,res,next) => {
  const id=Number(req.params.id);
  const allowed=['worker_code','phone','department','position','training_percent','status'];
  const payload={}; for(const key of allowed) if(Object.prototype.hasOwnProperty.call(req.body||{},key)) payload[key]=req.body[key];
  if ('training_percent' in payload) {
    payload.training_percent=Number(payload.training_percent);
    if (!Number.isFinite(payload.training_percent)||payload.training_percent<0||payload.training_percent>100) return res.status(400).json({success:false,message:'% học việc phải từ 0 đến 100'});
  }
  if ('status' in payload && !['active','inactive'].includes(payload.status)) return res.status(400).json({success:false,message:'Trạng thái không hợp lệ'});
  if (!Object.keys(payload).length) return res.status(400).json({success:false,message:'Không có dữ liệu cập nhật'});

  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();
    const [workers] = await connection.query('SELECT user_id FROM workers WHERE id=? LIMIT 1',[id]);
    await assertCanManageWorker(req.user, id, connection);
    if (!workers.length) {
      await connection.rollback();
      return res.status(404).json({success:false,message:'Không tìm thấy công nhân'});
    }
    await connection.query('UPDATE workers SET ? WHERE id=?',[payload,id]);
    if ('status' in payload) {
      await connection.query('UPDATE users SET status=? WHERE id=?',[payload.status,workers[0].user_id]);
      if (payload.status === 'inactive') {
        await revokeAllUserFamilies(workers[0].user_id, { executor: connection });
      }
    }
    await connection.commit();
    return res.json({success:true,message:'Cập nhật công nhân thành công'});
  } catch(error) {
    try { await connection.rollback(); } catch (_) {}
    if(error?.code==='ER_DUP_ENTRY') return res.status(409).json({success:false,message:'Mã công nhân đã tồn tại'});
    return next(error);
  } finally {
    connection.release();
  }
};

exports.setWorkerProcesses = async (req, res, next) => {
  const workerId = Number(req.params.id);
  const processIds = [...new Set((req.body?.process_ids || []).map(Number).filter(Number.isInteger))];

  if (!Number.isInteger(workerId) || workerId <= 0) {
    return res.status(400).json({ success:false, message:'ID công nhân không hợp lệ' });
  }

  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();
    const [workers] = await connection.query('SELECT user_id FROM workers WHERE id=? LIMIT 1', [workerId]);
    if (!workers.length) {
      await connection.rollback();
      return res.status(404).json({ success:false, message:'Không tìm thấy công nhân' });
    }
    await assertCanManageWorker(req.user, workerId, connection, { requireAllAssignments:true });
    await assertProcessesScope(req.user, processIds, { executor:connection, action:'WORKER_PROCESS_ASSIGNMENT' });

    if (processIds.length) {
      const [activeProcesses] = await connection.query(
        `SELECT id FROM processes WHERE id IN (?) AND status='active'`,
        [processIds]
      );
      if (activeProcesses.length !== processIds.length) {
        await connection.rollback();
        return res.status(400).json({ success:false, message:'Có công đoạn không tồn tại hoặc đã ngừng hoạt động' });
      }
    }

    await connection.query('DELETE FROM worker_processes WHERE worker_id=?', [workerId]);
    if (processIds.length) {
      await connection.query(
        'INSERT INTO worker_processes (worker_id,process_id) VALUES ?',
        [processIds.map((processId) => [workerId, processId])]
      );
    }

    await connection.commit();
    clearWorkerProfile(workers[0].user_id);
    return res.json({
      success:true,
      message: processIds.length ? 'Cập nhật phân công thành công' : 'Đã xóa phân công công đoạn'
    });
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    return next(error);
  } finally {
    connection.release();
  }
};