const db = require('../config/db');
const {readMasterResources,insertMasterResource,updateMasterResource,deactivateMasterResource} = require('../repositories/masterResourceRepository');
const { assertMasterResourceScope, assertCanManageWorker } = require('../services/masterResourceAuthorization');
const { clearWorkerProfile } = require('../utils/workerProfileCache');
const { getActorProcessScope, assertProcessScope, assertProcessesScope, scopeSql } = require('../services/processAuthorizationService');
const { revokeAllUserFamilies } = require('../services/refreshSessionService');
const { TABLES, PROCESS_BOUND_RESOURCES, LEAD_MANAGER_MASTER_RESOURCES, cleanPayload } = require('../domain/masterResourceDefinition');

function authErrorResponse(res, error) {
  if (error?.status === 403 || error?.statusCode === 403) {
    return res.status(403).json({ success:false, code:error.code || 'PROCESS_SCOPE_FORBIDDEN', message:error.message });
  }
  return null;
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

async function assertGcMachineCode(processId, machineCode, executor = db.promise()) {
  const code = String(machineCode ?? '').trim();
  const [processRows] = await executor.query(
    "SELECT process_code FROM processes WHERE id=? LIMIT 1",
    [Number(processId)]
  );
  if (String(processRows[0]?.process_code || '').trim().toUpperCase() === 'GC' && /^\d+$/.test(code)) {
    throw Object.assign(
      new Error('Mã máy công đoạn GC phải có tiền tố C hoặc ML; không chấp nhận mã số thuần như 2 hoặc 15'),
      { status: 400, code: 'GC_MACHINE_CODE_INVALID' }
    );
  }
}

function config(req, res) {
  const value = TABLES[req.params.resource];
  if (!value) {
    res.status(404).json({ success:false, message:'Danh mục quản trị không tồn tại' });
    return null;
  }
  return value;
}

exports.list = async (req, res, next) => {
  try {
    if (req.params.resource === 'managers') return res.status(410).json({success:false,message:'Chức năng manager đã chuyển sang Quản lý người dùng'});
    if (!requireMasterPermission(req,res) || !requireAdminForManagers(req,res)) return;
    const cfg = config(req,res); if (!cfg) return;
    const scope = await getActorProcessScope(req.user);
    const scoped = scopeSql(scope, cfg.table === 'processes' ? 't.id' : 't.process_id', []);
    const rows = await readMasterResources(db.promise(),cfg,scoped);
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
    const cfg=config(req,res); if(!cfg) return;
    const payload=cleanPayload(req.body,cfg);
    if (cfg.table === 'processes' && req.user?.role !== 'admin') {
      return res.status(403).json({success:false,code:'PROCESS_SCOPE_FORBIDDEN',message:'Chỉ admin được tạo công đoạn'});
    }
    if (PROCESS_BOUND_RESOURCES.has(req.params.resource)) {
      await assertProcessScope(req.user, payload.process_id, { action:'MASTER_CREATE' });
    }
    if (req.params.resource === 'machines') {
      await assertGcMachineCode(payload.process_id, payload.machine_code);
    }
    if (req.params.resource === 'standards') {
      // work_type is NOT NULL in TiDB; older clients may omit it.
      payload.work_type = String(payload.work_type || '').trim() || 'standard';
      payload.product_code = String(payload.product_code || '').trim();
      if (!payload.product_code) {
        return res.status(400).json({success:false,code:'PRODUCT_CODE_REQUIRED',message:'Vui lòng nhập mã sản phẩm'});
      }
    }
    try {
      const result = await insertMasterResource(db.promise(),cfg,payload);
      return res.status(201).json({success:true,message:'Tạo mới thành công',data:{id:result.insertId}});
    } catch(error) {
      const code = error?.code || error?.cause?.code || error?.details?.code;
      if(code === 'ER_DUP_ENTRY' || code === 1062) return res.status(409).json({success:false,code:'MASTER_DUPLICATE',message:'Mã hoặc dữ liệu đã tồn tại'});
      if(['ER_NO_DEFAULT_FOR_FIELD','ER_BAD_NULL_ERROR','ER_DATA_TOO_LONG','ER_WARN_DATA_OUT_OF_RANGE'].includes(code)) return res.status(422).json({success:false,code:'MASTER_INVALID_FIELD',message:'Dữ liệu định mức không hợp lệ'});
      return next(error);
    }
  } catch(error) { res.status(error.status||error.statusCode||400).json({success:false,code:error.code||undefined,message:error.message}); }
};

exports.update = async (req,res,next) => {
  try {
    if (!requireMasterPermission(req,res) || !requireAdminForManagers(req,res)) return;
    if (req.params.resource === 'managers') return res.status(410).json({success:false,message:'Chức năng manager đã chuyển sang Quản lý người dùng'});
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
      if (req.params.resource === 'machines') {
        const targetProcessId = 'process_id' in payload ? payload.process_id : existingProcessId;
        const [machineRows] = await connection.query('SELECT machine_code FROM machines WHERE id=? LIMIT 1', [id]);
        const targetMachineCode = 'machine_code' in payload ? payload.machine_code : machineRows[0]?.machine_code;
        await assertGcMachineCode(targetProcessId, targetMachineCode, connection);
      }
      await updateMasterResource(connection,cfg,id,payload);
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
      await deactivateMasterResource(connection,cfg,id);
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
    await assertProcessesScope(req.user, processIds, { executor:connection, action:'WORKER_PROCESS_ASSIGNMENT', allowEmpty:true });

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