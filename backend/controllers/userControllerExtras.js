const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');
const db = require('../config/db');
const { clearWorkerProfile } = require('../utils/workerProfileCache');
const { deleteCachedAuthUser } = require('../utils/authUserCache');
const { revokeAllUserFamilies } = require('../services/refreshSessionService');

const ROLE_CREATE_RULES = {
  admin: ['manager', 'lead', 'worker'],
  manager: ['lead', 'worker'],
  lead: ['worker'],
};
const manageableRoles = (role) => ROLE_CREATE_RULES[role] || [];
const normalizeStatus = (value) => value === 'inactive' ? 'inactive' : 'active';
const normalizeProcessIds = (value) => [...new Set((Array.isArray(value) ? value : [])
  .map(Number).filter((id) => Number.isInteger(id) && id > 0))];

function publicError(res, error, fallback) {
  console.error(fallback, error);
  return res.status(500).json({ success: false, message: fallback });
}

async function getActorProcessIds(connection, actor) {
  if (actor?.role === 'admin') return null;
  const [rows] = await connection.query(
    'SELECT process_id FROM manager_processes WHERE manager_id=?',
    [actor?.id],
  );
  return rows.map((row) => Number(row.process_id));
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

async function validateProcessAssignment(connection, actor, processIds, required = true) {
  if (required && processIds.length === 0) {
    const error = new Error('Phải phân ít nhất một công đoạn');
    error.status = 400;
    throw error;
  }
  if (!processIds.length) return;
  const [valid] = await connection.query(
    `SELECT id FROM processes WHERE id IN (${processIds.map(() => '?').join(',')}) AND status='active'`,
    processIds,
  );
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

async function replaceProcessAssignments(connection, role, userId, workerId, processIds) {
  if (role === 'worker') {
    await connection.query('DELETE FROM worker_processes WHERE worker_id=?', [workerId]);
    if (processIds.length) {
      await connection.query('INSERT INTO worker_processes (worker_id,process_id) VALUES ?',
        [processIds.map((processId) => [workerId, processId])]);
    }
    return;
  }
  await connection.query('DELETE FROM manager_processes WHERE manager_id=?', [userId]);
  if (processIds.length) {
    await connection.query('INSERT INTO manager_processes (manager_id,process_id) VALUES ?',
      [processIds.map((processId) => [userId, processId])]);
  }
}

exports.updateUser = async (req, res) => {
  const connection = await db.promise().getConnection();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID người dùng không hợp lệ' });
    const [found] = await connection.query(
      'SELECT u.id,u.role,w.id AS worker_id FROM users u LEFT JOIN workers w ON w.user_id=u.id WHERE u.id=? LIMIT 1',
      [id],
    );
    if (!found.length) return res.status(404).json({ success: false, message: 'Người dùng không tồn tại' });
    if (!await canManageTarget(connection, req.user, found[0])) return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa người dùng này' });

    const payload = {};
    if ('username' in (req.body || {})) payload.username = String(req.body.username || '').trim();
    if ('full_name' in (req.body || {})) payload.full_name = String(req.body.full_name || '').trim();
    if ('status' in (req.body || {})) payload.status = normalizeStatus(req.body.status);
    if (req.body?.password) {
      if (String(req.body.password).length < 6) return res.status(400).json({ success: false, message: 'Mật khẩu tối thiểu 6 ký tự' });
      payload.password = await bcrypt.hash(String(req.body.password), 10);
    }
    if ('username' in payload && !payload.username) return res.status(400).json({ success: false, message: 'Tên đăng nhập không được để trống' });
    if ('full_name' in payload && !payload.full_name) return res.status(400).json({ success: false, message: 'Họ tên không được để trống' });

    const workerPayload = {};
    if (found[0].role === 'worker') {
      for (const field of ['worker_code','phone','department','position','training_percent']) {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
          workerPayload[field] = req.body[field] === '' ? null : req.body[field];
        }
      }
      if ('training_percent' in workerPayload) {
        const value = Number(workerPayload.training_percent);
        if (!Number.isFinite(value) || value < 0 || value > 100) return res.status(400).json({ success:false, message:'% học việc phải từ 0 đến 100' });
        workerPayload.training_percent = value;
      }
    }
    const processIdsProvided = Array.isArray(req.body?.process_ids);
    const processIds = processIdsProvided ? normalizeProcessIds(req.body.process_ids) : [];
    if (!Object.keys(payload).length && !Object.keys(workerPayload).length && !processIdsProvided) return res.status(400).json({ success: false, message: 'Không có dữ liệu cập nhật' });

    await connection.beginTransaction();
    if (processIdsProvided) await validateProcessAssignment(connection, req.user, processIds, true);
    if (Object.keys(payload).length) await connection.query('UPDATE users SET ? WHERE id=?', [payload, id]);
    if (found[0].role === 'worker' && 'status' in payload) workerPayload.status = payload.status;
    if (found[0].role === 'worker' && Object.keys(workerPayload).length) await connection.query('UPDATE workers SET ? WHERE user_id=?', [workerPayload, id]);
    if (processIdsProvided) await replaceProcessAssignments(connection, found[0].role, id, found[0].worker_id, processIds);
    if (Object.prototype.hasOwnProperty.call(payload, 'password') || payload.status === 'inactive') {
      await revokeAllUserFamilies(id, { executor: connection });
    }
    await connection.commit();
    clearWorkerProfile(id);
    deleteCachedAuthUser(id);
    return res.json({ success: true, message: 'Cập nhật người dùng thành công' });
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Tên đăng nhập hoặc mã công nhân đã tồn tại' });
    if (error?.status) return res.status(error.status).json({ success:false, message:error.message });
    return publicError(res, error, 'Không thể cập nhật người dùng');
  } finally { connection.release(); }
};

function normalizeHeader(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, '_').replace(/^_|_$/g, '');
}
function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value.text != null) return String(value.text).trim();
  return String(value).trim();
}
function parsePercent(value) {
  const raw = String(value ?? '').replace('%', '').replace(',', '.').trim();
  if (!raw) return 100;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error('% học việc phải từ 0 đến 100');
  return number;
}

async function loadUsersForTransfer(connection, actor) {
  const roles = manageableRoles(actor?.role);
  if (!roles.length) return [];
  const placeholders = roles.map(() => '?').join(',');
  const params = [...roles];
  let scope = '';
  if (actor.role !== 'admin') {
    scope = `AND EXISTS (
      SELECT 1 FROM manager_processes actor_mp
      WHERE actor_mp.manager_id=? AND actor_mp.process_id IN (
        SELECT wp2.process_id FROM worker_processes wp2 WHERE u.role='worker' AND wp2.worker_id=w.id
        UNION
        SELECT mp2.process_id FROM manager_processes mp2 WHERE u.role IN ('manager','lead') AND mp2.manager_id=u.id
      )
    )`;
    params.push(actor.id);
  }
  const [rows] = await connection.query(
    `SELECT u.id,u.username,u.full_name,u.role,u.status,u.created_at,
            w.id worker_id,w.worker_code,w.phone,w.department,w.position,w.training_percent,
            GROUP_CONCAT(DISTINCT COALESCE(pw.process_name,pm.process_name) ORDER BY COALESCE(wp.process_id,mp.process_id) SEPARATOR ', ') process_names
     FROM users u
     LEFT JOIN workers w ON w.user_id=u.id
     LEFT JOIN worker_processes wp ON u.role='worker' AND wp.worker_id=w.id
     LEFT JOIN processes pw ON pw.id=wp.process_id
     LEFT JOIN manager_processes mp ON u.role IN ('manager','lead') AND mp.manager_id=u.id
     LEFT JOIN processes pm ON pm.id=mp.process_id
     WHERE u.role IN (${placeholders}) ${scope}
     GROUP BY u.id,u.username,u.full_name,u.role,u.status,u.created_at,w.id,w.worker_code,w.phone,w.department,w.position,w.training_percent
     ORDER BY FIELD(u.role,'manager','lead','worker'),u.full_name,u.username`, params,
  );
  return rows;
}

exports.exportUsersExcel = async (req, res) => {
  const connection = await db.promise().getConnection();
  try {
    const rows = await loadUsersForTransfer(connection, req.user);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('NhanSu');
    sheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Tên đăng nhập', key: 'username', width: 22 },
      { header: 'Họ và tên', key: 'full_name', width: 28 },
      { header: 'Vai trò', key: 'role', width: 16 },
      { header: 'Mã công nhân', key: 'worker_code', width: 18 },
      { header: 'Số điện thoại', key: 'phone', width: 18 },
      { header: 'Bộ phận', key: 'department', width: 20 },
      { header: 'Vị trí', key: 'position', width: 20 },
      { header: '% học việc', key: 'training_percent', width: 14 },
      { header: 'Công đoạn', key: 'process_names', width: 34 },
      { header: 'Trạng thái', key: 'status', width: 18 },
      { header: 'Mật khẩu', key: 'password', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1769D2' } };
    rows.forEach((row) => sheet.addRow({ ...row, password: '' }));
    sheet.autoFilter = { from: 'A1', to: 'L1' };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="KTC_NhanSu_${new Date().toISOString().slice(0,10)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return publicError(res, error, 'Không thể xuất Excel nhân sự');
  } finally { connection.release(); }
};

exports.importUsersExcel = async (req, res) => {
  const connection = await db.promise().getConnection();
  try {
    const raw = String(req.body?.file_base64 || '');
    const encoded = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
    if (!encoded) return res.status(400).json({ success: false, message: 'Chưa chọn file Excel' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(encoded, 'base64'));
    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ success: false, message: 'File Excel không có sheet dữ liệu' });

    const headerMap = new Map();
    sheet.getRow(1).eachCell((cell, column) => headerMap.set(normalizeHeader(cell.value), column));
    const required = ['ten_dang_nhap', 'ho_va_ten', 'vai_tro', 'cong_doan'];
    for (const key of required) if (!headerMap.has(key)) return res.status(400).json({ success: false, message: `Thiếu cột bắt buộc: ${key.replaceAll('_',' ')}` });

    const [processRows] = await connection.query('SELECT id,process_code,process_name FROM processes WHERE status="active" ORDER BY process_name');
    const processByKey = new Map();
    for (const row of processRows) {
      processByKey.set(String(row.id), Number(row.id));
      processByKey.set(String(row.process_code || '').trim().toLowerCase(), Number(row.id));
      processByKey.set(String(row.process_name || '').trim().toLowerCase(), Number(row.id));
    }

    await connection.beginTransaction();
    let created = 0; let updated = 0;
    const errors = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (!cellText(row.getCell(headerMap.get('ten_dang_nhap')).value) && !cellText(row.getCell(headerMap.get('ho_va_ten')).value)) continue;
      try {
        const username = cellText(row.getCell(headerMap.get('ten_dang_nhap')).value);
        const fullName = cellText(row.getCell(headerMap.get('ho_va_ten')).value);
        const roleRaw = cellText(row.getCell(headerMap.get('vai_tro')).value).toLowerCase();
        const role = roleRaw.includes('công nhân') || roleRaw === 'worker' ? 'worker' : roleRaw.includes('tổ trưởng') || roleRaw === 'lead' ? 'lead' : roleRaw === 'manager' || roleRaw.includes('quản lý') ? 'manager' : roleRaw;
        if (!username || !fullName || !manageableRoles(req.user.role).includes(role)) throw new Error(`Vai trò ${role || 'trống'} không được phép`);
        const processText = cellText(row.getCell(headerMap.get('cong_doan')).value);
        const processIds = processText.split(/[,;|]/).map((name) => processByKey.get(name.trim().toLowerCase())).filter(Boolean);
        const uniqueProcessIds = normalizeProcessIds(processIds);
        await validateProcessAssignment(connection, req.user, uniqueProcessIds, true);
        const statusRaw = headerMap.has('trang_thai') ? cellText(row.getCell(headerMap.get('trang_thai')).value).toLowerCase() : 'active';
        const status = statusRaw.includes('ngừng') || statusRaw.includes('inactive') ? 'inactive' : 'active';
        const password = headerMap.has('mat_khau') ? cellText(row.getCell(headerMap.get('mat_khau')).value) : '';
        const workerCode = headerMap.has('ma_cong_nhan') ? cellText(row.getCell(headerMap.get('ma_cong_nhan')).value) : '';
        const phone = headerMap.has('so_dien_thoai') ? cellText(row.getCell(headerMap.get('so_dien_thoai')).value) : '';
        const department = headerMap.has('bo_phan') ? cellText(row.getCell(headerMap.get('bo_phan')).value) : 'Sản xuất';
        const position = headerMap.has('vi_tri') ? cellText(row.getCell(headerMap.get('vi_tri')).value) : (role === 'worker' ? 'Công nhân' : 'Tổ trưởng');
        const trainingPercent = role === 'worker' ? parsePercent(headerMap.has('hoc_viec') ? row.getCell(headerMap.get('hoc_viec')).value : 100) : 100;

        const [existingRows] = await connection.query(
          `SELECT u.id,u.role,w.id worker_id,w.worker_code FROM users u LEFT JOIN workers w ON w.user_id=u.id WHERE u.username=? OR (?<>'' AND w.worker_code=?) LIMIT 1`,
          [username, workerCode, workerCode],
        );
        if (existingRows.length) {
          const existing = existingRows[0];
          if (existing.role !== role || !await canManageTarget(connection, req.user, existing)) throw new Error('Không có quyền cập nhật tài khoản này');
          const payload = { username, full_name: fullName, status };
          if (password) {
            if (password.length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự');
            payload.password = await bcrypt.hash(password, 10);
          }
          await connection.query('UPDATE users SET ? WHERE id=?', [payload, existing.id]);
          if (role === 'worker') {
            await connection.query('UPDATE workers SET ? WHERE user_id=?', [{ worker_code: workerCode || null, phone: phone || null, department: department || 'Sản xuất', position: position || 'Công nhân', training_percent: trainingPercent, status }, existing.id]);
          }
          await replaceProcessAssignments(connection, role, existing.id, existing.worker_id, uniqueProcessIds);
          if (password || status === 'inactive') await revokeAllUserFamilies(existing.id, { executor: connection });
          clearWorkerProfile(existing.id); deleteCachedAuthUser(existing.id);
          updated += 1;
        } else {
          if (!password || password.length < 6) throw new Error('Dòng mới bắt buộc có mật khẩu tối thiểu 6 ký tự');
          if (role === 'worker' && !workerCode) throw new Error('Công nhân mới bắt buộc có mã công nhân');
          const hash = await bcrypt.hash(password, 10);
          const [userResult] = await connection.query('INSERT INTO users (username,password,full_name,role,status) VALUES (?,?,?,?,?)', [username, hash, fullName, role, status]);
          let workerId = null;
          if (role === 'worker') {
            const [workerResult] = await connection.query('INSERT INTO workers (user_id,worker_code,phone,department,position,training_percent,status) VALUES (?,?,?,?,?,?,?)', [userResult.insertId, workerCode, phone || null, department || 'Sản xuất', position || 'Công nhân', trainingPercent, status]);
            workerId = workerResult.insertId;
          }
          await replaceProcessAssignments(connection, role, userResult.insertId, workerId, uniqueProcessIds);
          created += 1;
        }
      } catch (error) {
        errors.push(`Dòng ${rowNumber}: ${error.message}`);
      }
    }
    if (errors.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'File Excel có dữ liệu không hợp lệ', errors: errors.slice(0, 20) });
    }
    await connection.commit();
    return res.json({ success: true, message: `Đã nhập Excel: ${created} thêm mới, ${updated} cập nhật` });
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    return publicError(res, error, 'Không thể nhập Excel nhân sự');
  } finally { connection.release(); }
};
