'use strict';

const appendTokenizedSearch = (where, params, rawSearch, fields) => {
  const tokens = String(rawSearch || '').trim().split(/\s+/).filter(Boolean).slice(0, 12);
  for (const token of tokens) {
    const q = `%${token}%`;
    where.push(`(${fields.map((field) => `CAST(${field} AS CHAR) COLLATE utf8mb4_general_ci LIKE ?`).join(' OR ')})`);
    params.push(...fields.map(() => q));
  }
};

async function readApprovedReportPage(executor, filters, scoped) {
    const {pageSize,offset,dateFrom,dateTo,processId,processName,shift,search,includeMeta} = filters;
    const where = [
      "LOWER(TRIM(COALESCE(pr.status,'')))='approved'",
      "NOT EXISTS (SELECT 1 FROM production_reports split_child WHERE JSON_UNQUOTE(JSON_EXTRACT(split_child.extra_data, '$.split_from_report_id')) = CAST(pr.id AS CHAR))",
      'pr.work_date >= ?',
      'pr.work_date <= ?',
    ];
    const params = [dateFrom, dateTo];

    if (processId !== undefined && processId !== null && String(processId).trim() !== '') {
      const id = Number(processId);
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

    const [countRows] = await executor.query(
      `SELECT COUNT(*) AS total
         FROM production_reports pr
         LEFT JOIN workers w ON pr.worker_id=w.id
         LEFT JOIN users u ON w.user_id=u.id
         LEFT JOIN processes p ON pr.process_id=p.id
        WHERE ${whereSql}`,
      params,
    );

    // Derive target only from persisted report/machine-line snapshots, never live standards.
    // Canonical production_reports has no tt_dinh_muc column; referencing it breaks the list.
    const [dataRows] = await executor.query(
      `SELECT pr.*, p.process_code, p.process_name, w.worker_code, u.full_name,
              COALESCE((SELECT COUNT(DISTINCT d.defect_type_id)
                          FROM production_report_defects d
                         WHERE d.report_id=pr.id AND d.quantity>0), 0) AS worker_ng_type_count,
              COALESCE((SELECT COUNT(DISTINCT md.defect_type_id)
                          FROM production_report_machine_lines ml
                          JOIN production_report_machine_defects md ON md.machine_line_id=ml.id
                         WHERE ml.report_id=pr.id AND md.quantity>0), 0) AS machine_ng_type_count,
              COALESCE((SELECT COUNT(DISTINCT d.defect_type_id)
                          FROM production_report_defects d
                         WHERE d.report_id=pr.id AND d.quantity>0), 0)
              + COALESCE((SELECT COUNT(DISTINCT md.defect_type_id)
                            FROM production_report_machine_lines ml
                            JOIN production_report_machine_defects md ON md.machine_line_id=ml.id
                           WHERE ml.report_id=pr.id AND md.quantity>0), 0) AS ng_defect_type_count
         FROM production_reports pr
         LEFT JOIN workers w ON pr.worker_id=w.id
         LEFT JOIN users u ON w.user_id=u.id
         LEFT JOIN processes p ON pr.process_id=p.id
        WHERE ${whereSql}
        ORDER BY pr.work_date DESC, pr.id DESC
        LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    );

    // Hydrate worker-credit lines in one bounded query, never physical event totals.
    const ids = dataRows.map(row => row.id);
    const linesByReport = new Map();
    const deductionsByReport = new Map();
    if (ids.length) {
      const [lines] = await executor.query(
        `SELECT * FROM production_report_machine_lines WHERE report_id IN (${ids.map(()=>'?').join(',')}) ORDER BY id`, ids
      );
      for (const line of lines) {
        const key = String(line.report_id);
        if (!linesByReport.has(key)) linesByReport.set(key, []);
        linesByReport.get(key).push(line);
      }
    }
    // GC legacy single-line reports may have worker deductions only at parent level.
    const gcIds = dataRows.filter(row => String(row.process_code || '').toUpperCase() === 'GC' && (linesByReport.get(String(row.id)) || []).length === 1).map(row => row.id);
    if (gcIds.length) {
      const [deductions] = await executor.query(
        `SELECT report_id,hours FROM production_report_deductions WHERE report_id IN (${gcIds.map(()=>'?').join(',')})`,gcIds);
      for (const item of deductions) {
        const key = String(item.report_id);
        if (!deductionsByReport.has(key)) deductionsByReport.set(key, []);
        deductionsByReport.get(key).push(item);
      }
    }
    // Populate the process dropdown from ALL approved reports the actor may
    // view, not the 20 rows on the current page (nor the current date/shift).
    // The scope clause is mandatory so managers cannot discover other teams.
    let processes;
    if (includeMeta) {
      const [processRows] = await executor.query(
        `SELECT DISTINCT p.id, p.process_code, p.process_name
           FROM production_reports pr
           JOIN processes p ON p.id=pr.process_id
          WHERE LOWER(TRIM(COALESCE(pr.status,'')))='approved'
            AND NOT EXISTS (
              SELECT 1 FROM production_reports split_child
               WHERE JSON_UNQUOTE(JSON_EXTRACT(split_child.extra_data, '$.split_from_report_id'))=CAST(pr.id AS CHAR)
            )${scoped.clause}
          ORDER BY p.process_name, p.id`,
        scoped.params,
      );
      processes = processRows || [];
    }

    return { rows:dataRows, linesByReport, deductionsByReport, processes, total:Number(countRows[0]?.total || 0) };
}
module.exports = { readApprovedReportPage };
