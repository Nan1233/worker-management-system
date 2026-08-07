const db = require("../config/db");

const indexes = [
  ["production_reports", "idx_pr_status_date_process", ["status", "work_date", "process_id"]],
  ["production_reports", "idx_pr_worker_date", ["worker_id", "work_date"]],
  ["production_reports", "idx_pr_process_date", ["process_id", "work_date"]],
  ["production_reports_temp", "idx_prt_status_date_process", ["status", "work_date", "process_id"]],
  ["production_reports_temp", "idx_prt_worker_date", ["worker_id", "work_date"]],
  ["production_reports_temp", "idx_prt_process_date", ["process_id", "work_date"]],
  ["production_reports_temp", "idx_prt_similar_lookup", ["worker_id", "process_id", "work_date", "shift", "machine_no", "product_name", "status"]],
  ["production_reports_temp", "idx_prt_client_request", ["worker_id", "client_request_id"]],
  ["manager_processes", "idx_mp_manager_process", ["manager_id", "process_id"]],
  ["worker_processes", "idx_wp_worker_process", ["worker_id", "process_id"]],
  ["machines", "idx_machines_process_status_code", ["process_id", "status", "machine_code"]],
  ["product_standards", "idx_ps_process_status_code", ["process_id", "status", "product_code"]],
  ["defect_types", "idx_defects_process_status_sort", ["process_id", "status", "sort_order"]],
  ["deduction_types", "idx_deductions_process_status_sort", ["process_id", "status", "sort_order"]],
  ["users", "idx_users_username_status", ["username", "status"]],
  ["workers", "idx_workers_user_status", ["user_id", "status"]],
  ["production_report_defects", "idx_prd_report", ["report_id"]],
  ["production_report_deductions", "idx_prdu_report", ["report_id"]],
  ["production_temp_defects", "idx_ptd_report", ["temp_report_id"]],
  ["production_temp_deductions", "idx_ptdu_report", ["temp_report_id"]],
];

async function tableExists(table) {
  const [rows] = await db.promise().query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

async function indexExists(table, name) {
  const [rows] = await db.promise().query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
    [table, name],
  );
  return rows.length > 0;
}

(async () => {
  await db.testConnection();
  for (const [table, name, columns] of indexes) {
    if (!(await tableExists(table))) {
      console.log(`SKIP missing table: ${table}`);
      continue;
    }
    if (await indexExists(table, name)) {
      console.log(`OK existing: ${table}.${name}`);
      continue;
    }
    const escapedColumns = columns.map((column) => `\`${column}\``).join(", ");
    await db.promise().query(`CREATE INDEX \`${name}\` ON \`${table}\` (${escapedColumns})`);
    console.log(`CREATED: ${table}.${name}`);
  }
})()
  .catch((error) => {
    console.error("INDEX OPTIMIZATION FAILED:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => undefined);
  });
