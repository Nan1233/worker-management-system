require("dotenv").config();
const db = require("../config/db");

async function main() {
  const code = String(process.argv[2] || "").trim();
  const [dbRows] = await db.promise().query(
    "SELECT DATABASE() AS database_name, COUNT(*) AS user_count FROM users",
  );
  console.log("DATABASE", dbRows[0]);

  if (code) {
    const [rows] = await db.promise().query(
      `SELECT u.id, u.username, u.role, u.status,
              w.id AS worker_id, w.worker_code, w.status AS worker_status
       FROM users u
       LEFT JOIN workers w ON w.user_id = u.id
       WHERE TRIM(u.username) = ? OR TRIM(COALESCE(w.worker_code, '')) = ?`,
      [code, code],
    );
    console.table(rows);
  }

  const [orphans] = await db.promise().query(
    `SELECT w.id, w.worker_code, w.full_name
     FROM workers w
     LEFT JOIN users u ON u.id = w.user_id
     WHERE w.status = 'active' AND (w.user_id IS NULL OR u.id IS NULL)
     ORDER BY w.worker_code
     LIMIT 100`,
  );
  console.log(`Active workers without linked users: ${orphans.length}`);
  if (orphans.length) console.table(orphans);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => undefined);
  });
