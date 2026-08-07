const db = require("../config/db");

const tables = [
  "production_reports",
  "production_reports_temp",
  "production_report_defects",
  "production_report_deductions",
  "production_temp_defects",
  "production_temp_deductions",
  "product_standards",
  "manager_processes",
  "worker_processes",
];

(async () => {
  await db.testConnection();
  for (const table of tables) {
    const [exists] = await db.promise().query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [table],
    );
    if (!exists.length) continue;
    await db.promise().query(`ANALYZE TABLE \`${table}\``);
    console.log(`ANALYZED: ${table}`);
  }
})()
  .catch((error) => {
    console.error("ANALYZE FAILED:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => undefined);
  });
