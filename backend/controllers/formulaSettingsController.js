const db = require('../config/db');

exports.list = async (_req, res, next) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT ps.id, ps.process_id, ps.work_type, ps.product_code,
             CAST(ROUND(ps.standard_output) AS SIGNED) AS standard_output,
             COALESCE(ps.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt,
             p.process_code, p.process_name
      FROM product_standards ps
      LEFT JOIN processes p ON p.id = ps.process_id
      WHERE ps.status = 'active'
      ORDER BY p.process_name, ps.product_code, ps.work_type
    `);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

exports.updateProductRule = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success:false, message:'ID mã sản phẩm không hợp lệ' });
    }
    const value = req.body?.exclude_kqd_from_tt;
    const normalized = value === true || value === 1 || value === '1' ? 1 : value === false || value === 0 || value === '0' ? 0 : null;
    if (normalized === null) {
      return res.status(400).json({ success:false, message:'Quy tắc KQD không hợp lệ' });
    }
    const [result] = await db.promise().query(
      'UPDATE product_standards SET exclude_kqd_from_tt=? WHERE id=?',
      [normalized, id]
    );
    if (!result.affectedRows) return res.status(404).json({success:false,message:'Không tìm thấy mã sản phẩm'});
    res.json({ success:true, message:'Đã cập nhật công thức tính TT theo mã sản phẩm' });
  } catch (error) { next(error); }
};
