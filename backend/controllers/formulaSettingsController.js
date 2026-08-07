const db = require('../config/db');
const formulaSettingsService = require('../services/formulaSettingsService');

exports.list = async (_req, res, next) => {
  try {
    const [products] = await db.promise().query(`
      SELECT ps.id, ps.process_id, ps.product_code,
             CAST(ROUND(ps.standard_output) AS SIGNED) AS standard_output,
             COALESCE(ps.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt,
             p.process_code, p.process_name
      FROM product_standards ps
      LEFT JOIN processes p ON p.id = ps.process_id
      WHERE ps.status = 'active'
      ORDER BY p.process_name, ps.product_code
    `);
    const formulaData = await formulaSettingsService.loadAll();
    res.json({
      success: true,
      data: {
        products,
        scopes: formulaData.scopes,
        processes: formulaData.processes,
        defaults: formulaSettingsService.DEFAULT_SETTINGS,
        formulaOptions: {
          output_formula: [
            { value: 'ENTERED_X_TRAINING', label: 'Sản lượng nhập × % học việc' },
            { value: 'ENTERED_OUTPUT', label: 'Sản lượng công nhân nhập' },
            { value: 'OK_PLUS_NG', label: 'OK + NG' },
            { value: 'OK_X_TRAINING', label: 'OK × % học việc' }
          ],
          output_per_hour_formula: [
            { value: 'ADJUSTED_OUTPUT_DIV_ACTUAL_TIME', label: 'Sản lượng quy đổi / TG thực tế' },
            { value: 'ENTERED_OUTPUT_DIV_ACTUAL_TIME', label: 'Sản lượng nhập / TG thực tế' }
          ],
          achievement_formula: [
            { value: 'OUTPUT_PER_HOUR_DIV_STANDARD', label: 'SP/giờ / Định mức' }
          ],
          ng_rate_formula: [
            { value: 'NG_DIV_OK_PLUS_NG', label: 'NG / (OK + NG)' },
            { value: 'NG_DIV_ENTERED_OUTPUT', label: 'NG / Sản lượng nhập' }
          ],
          actual_time_formula: [
            { value: 'DATABASE_SNAPSHOT', label: 'TG thực tế đã lưu trong DB' },
            { value: 'WORKING_MINUS_DEDUCTION', label: 'TG làm việc - Tổng TG trừ' },
            { value: 'MACHINE_LINES_SUM', label: 'Tổng thời gian các máy' }
          ]
        }
      }
    });
  } catch (error) { next(error); }
};

exports.updateScope = async (req, res, next) => {
  try {
    const scopeCode = String(req.params.scopeCode || '').trim().toUpperCase();
    if (!/^GLOBAL$|^PROCESS:[A-Z0-9_-]+$/.test(scopeCode)) {
      return res.status(400).json({ success: false, message: 'Phạm vi công thức không hợp lệ' });
    }
    const data = await formulaSettingsService.saveScope(scopeCode, req.body || {}, req.user?.id);
    res.json({ success: true, message: 'Đã lưu cấu hình công thức và ngưỡng màu', data });
  } catch (error) { next(error); }
};

exports.resetScope = async (req, res, next) => {
  try {
    const scopeCode = String(req.params.scopeCode || '').trim().toUpperCase();
    if (!/^GLOBAL$|^PROCESS:[A-Z0-9_-]+$/.test(scopeCode)) {
      return res.status(400).json({ success: false, message: 'Phạm vi công thức không hợp lệ' });
    }
    const data = await formulaSettingsService.resetScope(scopeCode);
    res.json({ success: true, message: 'Đã khôi phục cấu hình mặc định', data });
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
