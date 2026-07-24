const db = require('../config/db');

const TABLES = {
  processes: { table:'processes', fields:['process_code','process_name','description','status'], required:['process_code','process_name'], order:'process_name' },
  defects: { table:'defect_types', fields:['process_id','defect_code','defect_name','sort_order','status'], required:['process_id','defect_code','defect_name'], order:'process_id, sort_order, defect_name' },
  deductions: { table:'deduction_types', fields:['process_id','deduction_code','deduction_name','sort_order','status'], required:['process_id','deduction_code','deduction_name'], order:'process_id, sort_order, deduction_name' },
  machines: { table:'machines', fields:['process_id','machine_code','machine_name','status'], required:['process_id','machine_code','machine_name'], order:'process_id, machine_code' },
  standards: { table:'product_standards', fields:['process_id','work_type','product_code','standard_output','exclude_kqd_from_tt','status'], required:['process_id','product_code','standard_output'], order:'process_id, product_code' }
};



function requireMasterPermission(req, res) {
  if (req.user?.role === 'lead' && req.params.resource !== 'machines') {
    res.status(403).json({ success:false, message:'Tổ trưởng chỉ được cấu hình công thức tại màn hình Công thức' });
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
  if ('exclude_kqd_from_tt' in payload) payload.exclude_kqd_from_tt = Number(payload.exclude_kqd_from_tt) === 1 ? 1 : 0;
  ['process_id','sort_order'].forEach((field) => {
    if (field in payload) payload[field] = Number(payload[field]);
  });
  if ('standard_output' in payload) {
    payload.standard_output = Number(payload.standard_output);
    if (!Number.isInteger(payload.standard_output) || payload.standard_output <= 0) {
      const error = new Error('Định mức phải là số nguyên dương');
      error.status = 400;
      throw error;
    }
  }
  return payload;
}

exports.list = (req, res, next) => {
  if (req.params.resource === 'managers') return res.status(410).json({success:false,message:'Chức năng manager đã chuyển sang Quản lý người dùng'});
  if (!requireMasterPermission(req,res) || !requireAdminForManagers(req,res)) return;
  const cfg = config(req,res); if (!cfg) return;
  const select = cfg.table === 'processes' ? 't.*' : 't.*, p.process_code, p.process_name';
  const join = cfg.table === 'processes' ? '' : 'LEFT JOIN processes p ON p.id=t.process_id';
  const sql = `SELECT ${select} FROM ${cfg.table} t ${join} ORDER BY ${cfg.order}`;
  db.query(sql, (error, rows) => {
    if (error) return next(error);
    const data = req.params.resource === 'standards'
      ? rows.map((row) => ({ ...row, standard_output: Math.round(Number(row.standard_output) || 0) }))
      : rows;
    return res.json({ success:true, data });
  });
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
    if (req.params.resource === 'standards' && !payload.work_type);
    db.query(`INSERT INTO ${cfg.table} SET ?`, payload, (error,result) => {
      if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({success:false,message:'Mã hoặc dữ liệu đã tồn tại'});
      if (error) return next(error);
      res.status(201).json({success:true,message:'Tạo mới thành công',data:{id:result.insertId}});
    });
  } catch(error) { res.status(error.status||400).json({success:false,message:error.message}); }
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
    db.query(`UPDATE ${cfg.table} SET ? WHERE id=?`,[payload,id],(error,result)=>{
      if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({success:false,message:'Mã hoặc dữ liệu đã tồn tại'});
      if(error) return next(error);
      if(!result.affectedRows) return res.status(404).json({success:false,message:'Không tìm thấy dữ liệu'});
      res.json({success:true,message:'Cập nhật thành công'});
    });
  } catch(error) { res.status(error.status||400).json({success:false,message:error.message}); }
};

exports.remove = (req,res,next) => {
  if (!requireMasterPermission(req,res) || !requireAdminForManagers(req,res)) return;
  if (req.params.resource === 'managers') return res.status(410).json({success:false,message:'Chức năng manager đã chuyển sang Quản lý người dùng'});
  if (false) {
    const id=Number(req.params.id); if(!Number.isInteger(id)||id<=0) return res.status(400).json({success:false,message:'ID không hợp lệ'});
    return db.query("UPDATE users SET status='inactive' WHERE id=? AND role='manager'",[id],(error,result)=>{if(error)return next(error);if(!result.affectedRows)return res.status(404).json({success:false,message:'Không tìm thấy manager'});res.json({success:true,message:'Đã khóa manager'});});
  }
  const cfg=config(req,res); if(!cfg) return;
  const id=Number(req.params.id); if(!Number.isInteger(id)||id<=0) return res.status(400).json({success:false,message:'ID không hợp lệ'});
  db.query(`UPDATE ${cfg.table} SET status='inactive' WHERE id=?`,[id],(error,result)=>{
    if(error) return next(error);
    if(!result.affectedRows) return res.status(404).json({success:false,message:'Không tìm thấy dữ liệu'});
    res.json({success:true,message:'Đã ngừng sử dụng dữ liệu'});
  });
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
    if (!workers.length) {
      await connection.rollback();
      return res.status(404).json({success:false,message:'Không tìm thấy công nhân'});
    }
    await connection.query('UPDATE workers SET ? WHERE id=?',[payload,id]);
    if ('status' in payload) {
      await connection.query('UPDATE users SET status=? WHERE id=?',[payload.status,workers[0].user_id]);
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

exports.setWorkerProcesses = (req,res,next) => {
  const workerId=Number(req.params.id); const processIds=[...new Set((req.body?.process_ids||[]).map(Number).filter(Number.isInteger))];
  db.getConnection((error,connection)=>{
    if(error) return next(error);
    connection.beginTransaction((error)=>{
      if(error){connection.release();return next(error);}
      connection.query('DELETE FROM worker_processes WHERE worker_id=?',[workerId],(error)=>{
        if(error) return connection.rollback(()=>{connection.release();next(error);});
        if(!processIds.length) return connection.commit((error)=>{connection.release(); error?next(error):res.json({success:true,message:'Đã xóa phân công công đoạn'});});
        connection.query('INSERT INTO worker_processes (worker_id,process_id) VALUES ?', [processIds.map(id=>[workerId,id])], (error)=>{
          if(error) return connection.rollback(()=>{connection.release();next(error);});
          connection.commit((error)=>{connection.release(); error?next(error):res.json({success:true,message:'Cập nhật phân công thành công'});});
        });
      });
    });
  });
};
