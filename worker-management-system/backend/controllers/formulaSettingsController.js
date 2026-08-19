const db = require('../config/db');
const formulaSettingsService = require('../services/formulaSettingsService');
const { getActorProcessScope, assertProcessScope } = require('../services/processAuthorizationService');

exports.list = async (req, res, next) => {
  try {
    const scope = await getActorProcessScope(req.user);
    const ids = scope.type === 'ALL' ? null : [...scope.processIds];
    const productWhere = scope.type === 'ALL' ? '' : ids.length ? ` AND ps.process_id IN (${ids.map(() => '?').join(',')})` : ' AND 1=0';
    const [products] = await db.promise().query(`
      SELECT ps.id, ps.process_id, ps.product_code,
             ps.standard_output AS standard_output,
             COALESCE(ps.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt,
             p.process_code, p.process_name
      FROM product_standards ps
      LEFT JOIN processes p ON p.id = ps.process_id
      WHERE ps.status = 'active' ${productWhere}
      ORDER BY p.process_name, ps.product_code
    `, ids || []);
    const formulaData = await formulaSettingsService.loadAll();
    const allowedProcessIds = scope.type === 'ALL' ? null : scope.processIds;
    const processes = scope.type === 'ALL' ? formulaData.processes : formulaData.processes.filter((p) => allowedProcessIds.has(Number(p.id)));
    const scopes = formulaData.scopes.filter((item) => item.scope_code === 'GLOBAL' || scope.type === 'ALL' || allowedProcessIds.has(Number(item.process_id)));
    const history = formulaData.history.filter((item) => item.scope_code === 'GLOBAL' || scope.type === 'ALL' || allowedProcessIds.has(Number(item.process_id)));
    res.json({
      success: true,
      data: {
        products,
        scopes,
        processes,
        history,
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
    if (scopeCode === 'GLOBAL') {
      if (req.user?.role !== 'admin') return res.status(403).json({success:false,code:'PROCESS_SCOPE_FORBIDDEN',message:'Chỉ admin được thay đổi công thức GLOBAL'});
    } else {
      const code = scopeCode.replace(/^PROCESS:/, '');
      const [rows] = await db.promise().query('SELECT id FROM processes WHERE UPPER(process_code)=? LIMIT 1', [code]);
      if (!rows[0]) return res.status(404).json({success:false,message:'Không tìm thấy công đoạn cần cấu hình'});
      await assertProcessScope(req.user, rows[0].id, { action:'FORMULA_EDIT' });
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
    if (scopeCode === 'GLOBAL') {
      if (req.user?.role !== 'admin') return res.status(403).json({success:false,code:'PROCESS_SCOPE_FORBIDDEN',message:'Chỉ admin được khôi phục công thức GLOBAL'});
    } else {
      const code = scopeCode.replace(/^PROCESS:/, '');
      const [rows] = await db.promise().query('SELECT id FROM processes WHERE UPPER(process_code)=? LIMIT 1', [code]);
      if (!rows[0]) return res.status(404).json({success:false,message:'Không tìm thấy công đoạn cần cấu hình'});
      await assertProcessScope(req.user, rows[0].id, { action:'FORMULA_RESET' });
    }
    const data = await formulaSettingsService.resetScope(scopeCode, req.user?.id);
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
    const [rows] = await db.promise().query('SELECT id,process_id FROM product_standards WHERE id=? LIMIT 1',[id]);
    if (!rows[0]) return res.status(404).json({success:false,message:'Không tìm thấy mã sản phẩm'});
    await assertProcessScope(req.user, rows[0].process_id, { action:'FORMULA_PRODUCT_EDIT' });
    const [result] = await db.promise().query(
      'UPDATE product_standards SET exclude_kqd_from_tt=? WHERE id=?',
      [normalized, id]
    );
    if (!result.affectedRows) return res.status(404).json({success:false,message:'Không tìm thấy mã sản phẩm'});
    res.json({ success:true, message:'Đã cập nhật công thức tính TT theo mã sản phẩm' });
  } catch (error) { next(error); }
};
