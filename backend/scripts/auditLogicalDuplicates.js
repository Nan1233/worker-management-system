const db = require('../config/db');
const { buildLogicalDuplicateKey } = require('../services/logicalDuplicateReportService');

async function loadGroups({ reportType, reportTable, lineTable, reportForeignKey, whereSql }) {
  const [reports] = await db.promise().query(`
    SELECT id, worker_id, process_id, work_date, shift, operation_mode, machine_no, product_name, status
    FROM ${reportTable}
    WHERE ${whereSql}
    ORDER BY id
  `);
  const ids = reports.map((r) => Number(r.id)).filter(Boolean);
  const machineRows = ids.length
    ? (await db.promise().query(`
        SELECT ${reportForeignKey} AS report_id, machine_code, product_code
        FROM ${lineTable}
        WHERE ${reportForeignKey} IN (${ids.map(() => '?').join(',')})
        ORDER BY ${reportForeignKey}, sort_order, id
      `, ids))[0]
    : [];
  const linesByReport = new Map();
  for (const line of machineRows) {
    const id = Number(line.report_id);
    if (!linesByReport.has(id)) linesByReport.set(id, []);
    linesByReport.get(id).push(line);
  }
  const groups = new Map();
  for (const row of reports) {
    const key = buildLogicalDuplicateKey({
      workerId: row.worker_id,
      processId: row.process_id,
      workDate: row.work_date,
      shift: row.shift,
      operationMode: row.operation_mode,
      machineNo: row.machine_no,
      productName: row.product_name,
      machineLines: linesByReport.get(Number(row.id)) || [],
    });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ report_type: reportType, id: Number(row.id), status: row.status });
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([logical_key, rows]) => ({
      report_type: reportType,
      logical_key,
      count: rows.length,
      report_ids: rows.map((r) => r.id),
      statuses: rows.map((r) => r.status),
    }));
}

async function run() {
  const collisions = [
    ...(await loadGroups({
      reportType: 'temp_blocking',
      reportTable: 'production_reports_temp',
      lineTable: 'production_temp_machine_lines',
      reportForeignKey: 'temp_report_id',
      whereSql: `status IN ('pending','need_fix')`,
    })),
    ...(await loadGroups({
      reportType: 'approved_active',
      reportTable: 'production_reports',
      lineTable: 'production_report_machine_lines',
      reportForeignKey: 'report_id',
      whereSql: `status <> 'deleted'`,
    })),
  ];
  const result = {
    classification: collisions.length ? 'REVIEW_REQUIRED' : 'CLEAN',
    collision_groups: collisions.length,
    collisions,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (require.main === module) {
  run().catch((error) => {
    console.error('LOGICAL DUPLICATE AUDIT FAILED:', error.message);
    process.exitCode = 1;
  }).finally(() => db.end?.());
}

module.exports = { run, loadGroups };
