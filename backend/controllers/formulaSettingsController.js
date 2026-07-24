const db = require('../config/db');

exports.list = async (_req, res, next) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT m.id, m.process_id, m.machine_code, m.machine_name,
             COALESCE(m.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt,
             p.process_code, p.process_name
      FROM machines m
      LEFT JOIN processes p ON p.id = m.process_id
      WHERE m.status = 'active'
      ORDER BY p.process_name, m.machine_code
    `);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

exports.updateMachineRule = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success:false, message:'ID máy không hợp lệ' });
    }
    const value = req.body?.exclude_kqd_from_tt;
    const normalized = value === true || value === 1 || value === '1' ? 1 : value === false || value === 0 || value === '0' ? 0 : null;
    if (normalized === null) {
      return res.status(400).json({ success:false, message:'Quy tắc KQD không hợp lệ' });
    }
    const [result] = await db.promise().query(
      'UPDATE machines SET exclude_kqd_from_tt=? WHERE id=?',
      [normalized, id]
    );
    if (!result.affectedRows) return res.status(404).json({success:false,message:'Không tìm thấy máy'});
    res.json({ success:true, message:'Đã cập nhật công thức tính TT' });
  } catch (error) { next(error); }
};
