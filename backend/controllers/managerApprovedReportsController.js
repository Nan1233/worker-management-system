'use strict';

const db = require('../config/db');
const { getActorProcessScope, scopeSql } = require('../services/processAuthorizationService');

const clampInt = (value, fallback, min, max) => {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const normalizeDate = (value, fallback) => {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
};

/**
 * Manager approved-report listing.
 * Filtering, counting and pagination stay in TiDB; the browser never downloads
 * the complete production_reports table just to display one page.
 */
exports.getApprovedReports = async (req, res) => {
  try {
    const page = clampInt(req.query?.page, 1, 1, 100000);
    const pageSize = clampInt(req.query?.page_size ?? req.query?.pageSize, 20, 1, 100);
    const offset = (page - 1) * pageSize;
    const dateFrom = normalizeDate(req.query?.date_from ?? req.query?.dateFrom, '0001-01-01');
    const dateTo = normalizeDate(req.query?.date_to ?? req.query?.dateTo, '9999-12-31');
    const processId = req.query?.process_id ?? req.query?.processId;
    const processName = String(req.query?.process_name ?? req.query?.processName ?? '').trim().slice(0, 120);
    const shift = String(req.query?.shift ?? '').trim().slice(0, 20);
    const search = String(req.query?.search ?? '').trim().slice(0, 120);

    if (dateFrom > dateTo) {
      return res.status(400).json({ success: false, code: 'INVALID_DATE_RANGE', message: 'Khoảng ngày báo cáo không hợp lệ' });
    }

    const scope = await getActorProcessScope(req.user);
    const scoped = scopeSql(scope, 'pr.process_id');
    const where = [
      "pr.status='approved'",
      'pr.work_date >= ?',
      'pr.work_date <= ?',
    ];
    const params = [dateFrom, dateTo];

    if (processId !== undefined && processId !== null && String(processId).trim() !== '') {
      const id = Number(processId);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, code: 'INVALID_PROCESS_ID', message: 'Công đoạn không hợp lệ' });
      where.push('pr.process_id=?');
      params.push(id);
    }
    if (processName) {
      where.push('p.process_name=?');
      params.push(processName);
    }
    if (shift) {
      where.push('pr.shift=?');
      params.push(shift);
    }
    if (search) {
      where.push('(w.worker_code LIKE ? OR u.full_name LIKE ? OR pr.machine_no LIKE ? OR pr.product_name LIKE ? OR p.process_name LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q, q, q);
    }
    if (scoped.clause) {
      where.push(scoped.clause.replace(/^\s*AND\s+/i, ''));
      params.push(...scoped.params);
    }

    const whereSql = where.join(' AND ');
    const [countRows, dataRows] = await Promise.all([
      db.promise().query(
        `SELECT COUNT(*) AS total
           FROM production_reports pr
           JOIN workers w ON pr.worker_id=w.id
           JOIN users u ON w.user_id=u.id
           JOIN processes p ON pr.process_id=p.id
          WHERE ${whereSql}`,
        params,
      ),
      db.promise().query(
        `SELECT pr.*, p.process_name, w.worker_code, u.full_name
           FROM production_reports pr
           JOIN workers w ON pr.worker_id=w.id
           JOIN users u ON w.user_id=u.id
           JOIN processes p ON pr.process_id=p.id
          WHERE ${whereSql}
          ORDER BY pr.work_date DESC, pr.id DESC
          LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      ),
    ]);

    const total = Number(countRows[0]?.[0]?.total || 0);
    return res.json({
      success: true,
      data: dataRows[0] || [],
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    if (error?.code === 'PROCESS_SCOPE_FORBIDDEN') {
      return res.status(403).json({ success: false, code: error.code, message: error.message });
    }
    console.error('GET MANAGER APPROVED REPORTS ERROR:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải báo cáo đã duyệt' });
  }
};
