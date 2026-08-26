const db = require("../config/db");
const { mergeDefects, normalizeDeductions } = require("../utils/reportDetailNormalizer");
const { query } = require("./productionTempModelShared");
const { paginationMeta } = require("../services/managerReportPaginationService");

function buildListFilters(managerId, filters, isAdmin, statusSql) {
    const params = [];
    const conditions = [statusSql];
    if (!isAdmin) {
        conditions.push(`EXISTS (
            SELECT 1 FROM manager_processes mp
            WHERE mp.process_id = pr.process_id
              AND mp.manager_id = ?
        )`);
        params.push(managerId);
    }
    if (filters.date) { conditions.push("pr.work_date = ?"); params.push(filters.date); }
    if (filters.date_from) { conditions.push("pr.work_date >= ?"); params.push(filters.date_from); }
    if (filters.date_to) { conditions.push("pr.work_date <= ?"); params.push(filters.date_to); }
    if (filters.shift) { conditions.push("pr.shift = ?"); params.push(filters.shift); }
    if (filters.process_id) { conditions.push("pr.process_id = ?"); params.push(filters.process_id); }
    if (filters.process_name) { conditions.push("p.process_name = ?"); params.push(filters.process_name); }
    if (filters.search) {
        conditions.push("(w.worker_code LIKE ? OR u.full_name LIKE ? OR p.process_name LIKE ? OR pr.machine_no LIKE ? OR pr.product_name LIKE ?)");
        const search = `%${filters.search}%`;
        params.push(search, search, search, search, search);
    }
    return { conditions, params };
}

async function getProcessOptions(managerId, isAdmin) {
    const params = [];
    const scope = isAdmin ? "" : `AND EXISTS (
        SELECT 1 FROM manager_processes mp
        WHERE mp.manager_id = ? AND mp.process_id = p.id
    )`;
    if (!isAdmin) params.push(managerId);
    return query(db, `SELECT p.id, p.process_name
        FROM processes p
        WHERE p.status='active' ${scope}
        ORDER BY p.process_name ASC, p.id ASC`, params);
}

async function getPreviousPendingCount(managerId, isAdmin) {
    const params = [];
    const scope = isAdmin ? "" : `AND EXISTS (
        SELECT 1 FROM manager_processes mp
        WHERE mp.manager_id = ? AND mp.process_id = pr.process_id
    )`;
    if (!isAdmin) params.push(managerId);
    const rows = await query(db, `SELECT COUNT(*) AS total
        FROM production_reports_temp pr
        WHERE pr.status IN ('pending','need_fix')
          AND pr.work_date < CURRENT_DATE()
          ${scope}`, params);
    return Number(rows?.[0]?.total || 0);
}

async function getTempMachineLines(tempReportId) {
    const lines = await query(
        db,
        `SELECT *
         FROM production_temp_machine_lines
         WHERE temp_report_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [Number(tempReportId)]
    );

    if (!lines.length) return [];

    const ids = lines.map((line) => Number(line.id)).filter(Boolean);
    if (!ids.length) return lines;

    const defects = await query(
        db,
        `SELECT *
         FROM production_temp_machine_defects
         WHERE machine_line_id IN (${ids.map(() => "?").join(",")})
         ORDER BY machine_line_id ASC, id ASC`,
        ids
    );

    const byLine = new Map();
    for (const defect of defects) {
        const key = Number(defect.machine_line_id);
        if (!byLine.has(key)) byLine.set(key, []);
        byLine.get(key).push(defect);
    }

    return lines.map((line) => ({
        ...line,
        defects: byLine.get(Number(line.id)) || []
    }));
}

module.exports = {
    async getPending(managerId, filters = {}, isAdmin = false) {
        const { page = 1, page_size: pageSize = 20, offset = 0 } = filters.pagination || {};
        const { conditions, params } = buildListFilters(managerId, filters, isAdmin, "pr.status IN ('pending', 'need_fix')");
        const where = conditions.join(" AND ");
        const [countRows, items, processes, previousCount] = await Promise.all([
            query(db, `SELECT COUNT(*) AS total
                 FROM production_reports_temp pr
                 JOIN workers w ON pr.worker_id = w.id
                 JOIN users u ON w.user_id = u.id
                 JOIN processes p ON pr.process_id = p.id
                 WHERE ${where}`, params),
            query(db, `SELECT
                    pr.id, pr.work_date, pr.shift, pr.machine_no, pr.product_name,
                    pr.updated_at, w.worker_code, u.full_name, p.process_name
                 FROM production_reports_temp pr
                 JOIN workers w ON pr.worker_id = w.id
                 JOIN users u ON w.user_id = u.id
                 JOIN processes p ON pr.process_id = p.id
                 WHERE ${where}
                 ORDER BY pr.work_date DESC, pr.created_at ASC, pr.id ASC
                 LIMIT ? OFFSET ?`, [...params, pageSize, offset]),
            getProcessOptions(managerId, isAdmin),
            getPreviousPendingCount(managerId, isAdmin)
        ]);
        const total = Number(countRows?.[0]?.total || 0);
        return {
            items,
            pagination: paginationMeta({ page, pageSize, total }),
            processes,
            previous_count: previousCount
        };
    },

    async getApproved(managerId, filters = {}, isAdmin = false) {
        const { page = 1, page_size: pageSize = 20, offset = 0 } = filters.pagination || {};
        const { conditions, params } = buildListFilters(managerId, filters, isAdmin, "pr.status = 'approved'");
        const where = conditions.join(" AND ");
        const [countRows, items, processes] = await Promise.all([
            query(db, `SELECT COUNT(*) AS total
                 FROM production_reports pr
                 JOIN workers w ON pr.worker_id = w.id
                 JOIN users u ON w.user_id = u.id
                 JOIN processes p ON pr.process_id = p.id
                 WHERE ${where}`, params),
            query(db, `SELECT pr.id, pr.work_date, pr.shift, pr.machine_no, pr.product_name,
                        pr.training_percent_snapshot,
                        pr.training_percent_snapshot AS training_percent,
                        w.worker_code, u.full_name, p.process_name
                 FROM production_reports pr
                 JOIN workers w ON pr.worker_id = w.id
                 JOIN users u ON w.user_id = w.id
                 JOIN processes p ON pr.process_id = p.id
                 WHERE ${where}
                 ORDER BY pr.approved_at DESC, pr.id DESC
                 LIMIT ? OFFSET ?`, [...params, pageSize, offset]),
            getProcessOptions(managerId, isAdmin)
        ]);
        const total = Number(countRows?.[0]?.total || 0);
        return { items, pagination: paginationMeta({ page, pageSize, total }), processes };
    },

    async getDates(managerId = null) {
        if (managerId) {
            return query(db, `
                SELECT DISTINCT DATE(pr.work_date) AS date
                FROM production_reports_temp pr
                JOIN manager_processes mp ON mp.process_id = pr.process_id
                WHERE mp.manager_id = ?
                  AND pr.status IN ('pending', 'need_fix')
                ORDER BY date DESC
            `, [managerId]);
        }

        return query(db, `
            SELECT DISTINCT DATE(work_date) AS date
            FROM production_reports_temp
            WHERE status IN ('pending', 'need_fix')
            ORDER BY date DESC
        `);
    },

    async getByDate(date, managerId = null) {
        const params = [date];
        let scope = "";

        if (managerId) {
            scope = " AND mp.manager_id = ?";
            params.push(managerId);
        }

        return query(db, `
            SELECT
                pr.*,
                w.worker_code,
                u.full_name,
                p.process_name,
                CASE WHEN dup.duplicate_count > 1 THEN 1 ELSE 0 END AS is_duplicate,
                COALESCE(dup.duplicate_count, 1) AS duplicate_count
            FROM production_reports_temp pr
            JOIN workers w ON pr.worker_id = w.id
            JOIN users u ON w.user_id = u.id
            JOIN processes p ON pr.process_id = p.id
            LEFT JOIN manager_processes mp ON mp.process_id = pr.process_id
            LEFT JOIN (
                SELECT worker_id, work_date, shift, machine_no, product_name, COUNT(*) AS duplicate_count
                FROM production_reports_temp
                WHERE status IN ('pending', 'need_fix')
                GROUP BY worker_id, work_date, shift, machine_no, product_name
            ) dup
                ON dup.worker_id = pr.worker_id
                AND dup.work_date = pr.work_date
                AND dup.shift = pr.shift
                AND COALESCE(dup.machine_no, '') = COALESCE(pr.machine_no, '')
                AND COALESCE(dup.product_name, '') = COALESCE(pr.product_name, '')
            WHERE pr.work_date = ?
              AND pr.status IN ('pending', 'need_fix')
              ${scope}
            ORDER BY pr.created_at ASC
        `, params);
    },

    async getDetail(id) {
        const rows = await query(db, `SELECT pr.*, w.worker_code, u.full_name, p.process_name,
                    reviewer.full_name AS reviewer_name
             FROM production_reports_temp pr
             JOIN workers w ON pr.worker_id = w.id
             JOIN users u ON w.user_id = u.id
             JOIN processes p ON pr.process_id = p.id
             LEFT JOIN users reviewer ON reviewer.id = pr.reviewed_by
             WHERE pr.id = ?
             LIMIT 1`, [id]);

        if (!rows[0]) return null;

        const [defects, deductions, machineLines] = await Promise.all([
            query(db, `SELECT d.id, d.defect_type_id, dt.defect_code, dt.defect_name, d.quantity
                 FROM production_temp_defects d
                 LEFT JOIN defect_types dt ON dt.id = d.defect_type_id
                 WHERE d.temp_report_id = ?
                 ORDER BY COALESCE(dt.sort_order, 999999), d.id`, [id]),
            query(db, `SELECT d.id, d.deduction_type_id, dt.deduction_code, dt.deduction_name, d.hours
                 FROM production_temp_deductions d
                 LEFT JOIN deduction_types dt ON dt.id = d.deduction_type_id
                 WHERE d.temp_report_id = ?
                 ORDER BY COALESCE(dt.sort_order, 999999), d.id`, [id]),
            getTempMachineLines(id)
        ]);

        return { ...rows[0], defects: mergeDefects(rows[0], defects), deductions: normalizeDeductions(deductions), machine_lines: machineLines };
    },

    async canManageReport(reportId, managerId, isAdmin = false) {
        if (isAdmin) return true;
        const rows = await query(db, `SELECT 1
             FROM production_reports_temp pr
             JOIN manager_processes mp ON mp.process_id = pr.process_id
             WHERE pr.id = ? AND mp.manager_id = ?
             LIMIT 1`, [reportId, managerId]);
        return rows.length > 0;
    }
};
