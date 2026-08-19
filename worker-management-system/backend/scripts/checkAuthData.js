require("dotenv").config();
const db = require("../config/db");

const DEBUG = String(process.env.KTC_DEBUG_AUTH_DATA || "").toLowerCase() === "true";

async function main() {
  const code = String(process.argv[2] || "").trim();
  const [dbRows] = await db.promise().query(
    "SELECT DATABASE() AS database_name, COUNT(*) AS user_count FROM users",
  );

  // This diagnostic utility is intentionally aggregate-only by default.
  // Never print usernames, worker names/codes, roles, or status data in
  // production logs. Set KTC_DEBUG_AUTH_DATA=true only for local debugging.
  console.log("AUTH DATA SUMMARY", {
    database_name: dbRows[0]?.database_name || null,
    user_count: Number(dbRows[0]?.user_count || 0),
  });

  if (code && DEBUG) {
    const [rows] = await db.promise().query(
      `SELECT u.id, u.username, u.role, u.status,
              w.id AS worker_id, w.worker_code, w.status AS worker_status
       FROM users u
       LEFT JOIN workers w ON w.user_id = u.id
       WHERE TRIM(u.username) = ? OR TRIM(COALESCE(w.worker_code, '')) = ?`,
      [code, code],
    );
    console.table(rows);
  } else if (code) {
    console.log("AUTH DATA DETAIL SUPPRESSED; set KTC_DEBUG_AUTH_DATA=true for local diagnostics");
  }

  const [orphans] = await db.promise().query(
    `SELECT COUNT(*) AS orphan_count
     FROM workers w
     LEFT JOIN users u ON u.id = w.user_id
     WHERE w.status = 'active' AND (w.user_id IS NULL OR u.id IS NULL)`,
  );
  const orphanCount = Number(orphans[0]?.orphan_count || 0);
  console.log(`Active workers without linked users: ${orphanCount}`);

  if (orphanCount && DEBUG) {
    const [rows] = await db.promise().query(
      `SELECT w.id, w.worker_code, w.full_name
       FROM workers w
       LEFT JOIN users u ON u.id = w.user_id
       WHERE w.status = 'active' AND (w.user_id IS NULL OR u.id IS NULL)
       ORDER BY w.worker_code
       LIMIT 100`,
    );
    console.table(rows);
  }
}

main()
  .catch((error) => {
    console.error("AUTH DATA CHECK FAILED:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => undefined);
  });
