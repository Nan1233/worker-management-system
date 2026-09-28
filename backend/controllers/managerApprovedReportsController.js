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
 * Build a user-friendly multi-word, accent-insensitive search predicate.
 *
 * Every whitespace-separated token must match at least one searchable field,
 * while all tokens must match. The explicit utf8mb4_general_ci collation is
 * intentional: it makes Vietnamese diacritics searchable by their base
 * letters, so "phuo" matches "Phương" and "thanh ph" matches
 * "An Thị Thanh Phương", even when the DB column uses a binary collation.
 *
 * Examples:
 *   an        -> An Thị Thanh Phương
 *   an t      -> An Thị Thanh Phương
 *   phuo      -> An Thị Thanh Phương
 *   phuong    -> An Thị Thanh Phương
 *   thanh ph  -> An Thị Thanh Phương
 *
 * Report code / worker code / machine / product / process searches remain
 * partial substring searches as before.
 */
const appendTokenizedSearch = (where, params, rawSearch, fields) => {
  const tokens = String(rawSearch || '').trim().split(/\s+/).filter(Boolean).slice(0, 12);
  for (const token of tokens) {
    const q = `%${token}%`;
    where.push(`(${fields.map((field) => `CAST(${field} AS CHAR) COLLATE utf8mb4_general_ci LIKE ?`).join(' OR ')})`);
    params.push(...fields.map(() => q));
  }
};

/**
 * Manager approved-report listing.
 * Filtering, counting and pagination stay in TiDB; the browser never downloads
 * the complete production_reports table just to display one page.
 *
 * Cloudflare/TiDB Serverless note: do not run the COUNT and page SELECT in
 * Promise.all(). Each Cloudflare query creates a separate Serverless driver
 * connection, so parallel queries add avoidable connection/rate contention.
 * Also keep LIMIT/OFFSET values as validated integers in the SQL text instead
 * of parameter markers; this is more portable across the TiDB Serverless
 * driver used by the Worker.
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
      appendTokenizedSearch(where, params, search, [
        'w.worker_code',
        'u.full_name',
        'pr.machine_no',
        'pr.product_name',
        'p.process_name',
      ]);
    }
    if (scoped.clause) {
      where.push(scoped.clause.replace(/^\s*AND\s+/i, ''));
      params.push(...scoped.params);
    }

    const whereSql = where.join(' AND ');

    const [countRows] = await db.promise().query(
      `SELECT COUNT(*) AS total
         FROM production_reports pr
         JOIN workers w ON pr.worker_id=w.id
         JOIN users u ON w.user_id=u.id
         JOIN processes p ON pr.process_id=p.id
        WHERE ${whereSql}`,
      params,
    );

    const [dataRows] = await db.promise().query(
      `SELECT pr.*, p.process_name, w.worker_code, u.full_name,
              COALESCE(pr.training_percent_snapshot, w.training_percent, 100) AS training_percent
         FROM production_reports pr
         JOIN workers w ON pr.worker_id=w.id
         JOIN users u ON w.user_id=u.id
         JOIN processes p ON pr.process_id=p.id
        WHERE ${whereSql}
        ORDER BY pr.work_date DESC, pr.id DESC
        LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    );

    const total = Number(countRows[0]?.total || 0);
    return res.json({
      success: true,
      data: dataRows || [],
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
    return res.status(500).json({
      success: false,
      code: 'APPROVED_REPORTS_QUERY_FAILED',
      message: 'Không thể tải báo cáo đã duyệt',
    });
  }
};