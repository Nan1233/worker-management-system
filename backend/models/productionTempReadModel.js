const db = require("../config/db");
const { mergeDefects, normalizeDeductions } = require("../utils/reportDetailNormalizer");
const { query } = require("./productionTempModelShared");

module.exports = {
    async getPending(managerId, filters = {}, isAdmin = false) {
        const params = [];
        const conditions = ["pr.status IN ('pending', 'need_fix')"];
        if (!isAdmin) {
            conditions.push(`EXISTS (
                SELECT 1 FROM manager_processes mp
                WHERE mp.process_id = pr.process_id
                  AND mp.manager_id = ?
            )`);
            params.push(managerId);
        }
        if (filters.date) { conditions.push("DATE(pr.work_date) = ?"); params.push(filters.date); }
        if (filters.date_from) { conditions.push("pr.work_date >= ?"); params.push(filters.date_from); }
        if (filters.date_to) { conditions.push("pr.work_date <= ?"); params.push(filters.date_to); }
        if (filters.shift) { conditions.push("pr.shift = ?"); params.push(filters.shift); }
        if (filters.process_id) { conditions.push("pr.process_id = ?"); params.push(filters.process_id); }
        if (filters.search) {
            conditions.push("(w.worker_code LIKE ? OR u.full_name LIKE ? OR pr.machine_no LIKE ? OR pr.product_name LIKE ?)");
            const search = `%${filters.search}%`;
            params.push(search, search, search, search);
        }
        return query(db, `SELECT
                pr.*, w.worker_code, u.full_name, p.process_name
             FROM production_reports_temp pr
             JOIN workers w ON pr.worker_id = w.id
             JOIN users u ON w.user_id = u.id
             JOIN processes p ON pr.process_id = p.id
             WHERE ${conditions.join(" AND ")}
             ORDER BY pr.work_date DESC, pr.created_at ASC`, params);
    },

    async getApproved(managerId, filters = {}, isAdmin = false) {
        const params = [];
        const conditions = ["pr.status = 'approved'"];
        if (!isAdmin) {
            conditions.push(`EXISTS (
                SELECT 1 FROM manager_processes mp
                WHERE mp.process_id = pr.process_id
                  AND mp.manager_id = ?
            )`);
            params.push(managerId);
        }
        if (filters.date) { conditions.push("DATE(pr.work_date) = ?"); params.push(filters.date); }
        if (filters.date_from) { conditions.push("pr.work_date >= ?"); params.push(filters.date_from); }
        if (filters.date_to) { conditions.push("pr.work_date <= ?"); params.push(filters.date_to); }
        if (filters.shift) { conditions.push("pr.shift = ?"); params.push(filters.shift); }
        if (filters.process_id) { conditions.push("pr.process_id = ?"); params.push(filters.process_id); }
        if (filters.search) {
            conditions.push("(w.worker_code LIKE ? OR u.full_name LIKE ? OR pr.machine_no LIKE ? OR pr.product_name LIKE ?)");
            const search = `%${filters.search}%`;
            params.push(search, search, search, search);
        }
        return query(db, `SELECT pr.*, w.worker_code, u.full_name, p.process_name,
                    reviewer.full_name AS reviewer_name
             FROM production_reports pr
             JOIN workers w ON pr.worker_id = w.id
             JOIN users u ON w.user_id = u.id
             JOIN processes p ON pr.process_id = p.id
             LEFT JOIN users reviewer ON reviewer.id = pr.reviewed_by
             WHERE ${conditions.join(" AND ")}
             ORDER BY pr.approved_at DESC, pr.id DESC`, params);
    },

    async getDates(
    managerId = null
) {
    if (managerId) {
        return query(
            db,
            `
                SELECT DISTINCT
                    DATE(pr.work_date) AS date

                FROM production_reports_temp pr

                JOIN manager_processes mp
                    ON mp.process_id =
                       pr.process_id

                WHERE mp.manager_id = ?
                  AND pr.status IN (
                        'pending',
                        'need_fix'
                  )

                ORDER BY date DESC
            `,
            [
                managerId
            ]
        );
    }

    return query(
        db,
        `
            SELECT DISTINCT
                DATE(work_date) AS date

            FROM production_reports_temp

            WHERE status IN (
                'pending',
                'need_fix'
            )

            ORDER BY date DESC
        `
    );
},

    async getByDate(
    date,
    managerId = null
) {
    const params = [
        date
    ];

    let scope = "";

    if (managerId) {
        scope =
            " AND mp.manager_id = ?";

        params.push(
            managerId
        );
    }

    return query(
        db,
        `
            SELECT
                pr.*,
                w.worker_code,
                u.full_name,
                p.process_name,

                CASE
                    WHEN dup.duplicate_count > 1
                    THEN 1
                    ELSE 0
                END AS is_duplicate,

                COALESCE(
                    dup.duplicate_count,
                    1
                ) AS duplicate_count

            FROM production_reports_temp pr

            JOIN workers w
                ON pr.worker_id = w.id

            JOIN users u
                ON w.user_id = u.id

            JOIN processes p
                ON pr.process_id = p.id

            LEFT JOIN manager_processes mp
                ON mp.process_id = pr.process_id

            LEFT JOIN (
                SELECT
                    worker_id,
                    work_date,
                    shift,
                    machine_no,
                    product_name,
                    COUNT(*) AS duplicate_count

                FROM production_reports_temp

                WHERE status IN (
                    'pending',
                    'need_fix'
                )

                GROUP BY
                    worker_id,
                    work_date,
                    shift,
                    machine_no,
                    product_name
            ) dup
                ON dup.worker_id = pr.worker_id
                AND dup.work_date = pr.work_date
                AND dup.shift = pr.shift
                AND COALESCE(
                    dup.machine_no,
                    ''
                ) = COALESCE(
                    pr.machine_no,
                    ''
                )
                AND COALESCE(
                    dup.product_name,
                    ''
                ) = COALESCE(
                    pr.product_name,
                    ''
                )

            WHERE pr.work_date = ?
              AND pr.status IN (
                    'pending',
                    'need_fix'
              )
              ${scope}

            ORDER BY
                pr.created_at ASC
        `,
        params
    );
},

    async getDetail(id) {
        const rows = await query(
            db,
            `SELECT pr.*, w.worker_code, u.full_name, p.process_name,
                    reviewer.full_name AS reviewer_name
             FROM production_reports_temp pr
             JOIN workers w ON pr.worker_id = w.id
             JOIN users u ON w.user_id = u.id
             JOIN processes p ON pr.process_id = p.id
             LEFT JOIN users reviewer ON reviewer.id = pr.reviewed_by
             WHERE pr.id = ?
             LIMIT 1`,
            [id]
        );

        if (!rows[0]) return null;

        const [defects, deductions, machineLines] = await Promise.all([
            query(
                db,
                `SELECT d.id, d.defect_type_id, dt.defect_code, dt.defect_name, d.quantity
                 FROM production_temp_defects d
                 LEFT JOIN defect_types dt ON dt.id = d.defect_type_id
                 WHERE d.temp_report_id = ?
                 ORDER BY COALESCE(dt.sort_order, 999999), d.id`,
                [id]
            ),
            query(
                db,
                `SELECT d.id, d.deduction_type_id, dt.deduction_code, dt.deduction_name, d.hours
                 FROM production_temp_deductions d
                 LEFT JOIN deduction_types dt ON dt.id = d.deduction_type_id
                 WHERE d.temp_report_id = ?
                 ORDER BY COALESCE(dt.sort_order, 999999), d.id`,
                [id]
            ),
            this.getTempMachineLines(id)
        ]);

        return { ...rows[0], defects: mergeDefects(rows[0], defects), deductions: normalizeDeductions(deductions), machine_lines: machineLines };
    },

    async canManageReport(reportId, managerId, isAdmin = false) {
        if (isAdmin) return true;
        const rows = await query(
            db,
            `SELECT 1
             FROM production_reports_temp pr
             JOIN manager_processes mp ON mp.process_id = pr.process_id
             WHERE pr.id = ? AND mp.manager_id = ?
             LIMIT 1`,
            [reportId, managerId]
        );
        return rows.length > 0;
    }
};
