const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

const EXPECTED_DB = "worker_management_e2e";
const actualDb = String(process.env.DB_NAME || "").trim();

if (actualDb !== EXPECTED_DB) {
  console.error(
    `E2E REFUSED: DB_NAME must be ${EXPECTED_DB}, received ${actualDb || "<empty>"}`
  );
  process.exit(2);
}

const required = ["DB_HOST", "DB_USER", "DB_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`E2E REFUSED: missing database variables: ${missing.join(", ")}`);
  process.exit(2);
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: EXPECTED_DB,
    ssl: { rejectUnauthorized: true },
  });

  try {
    const [rows] = await connection.query("SELECT DATABASE() AS database_name");
    const databaseName = String(rows?.[0]?.database_name || "").trim();

    if (databaseName !== EXPECTED_DB) {
      throw new Error(
        `Connected database mismatch: expected ${EXPECTED_DB}, received ${databaseName || "<empty>"}`
      );
    }

    const [tableRows] = await connection.query(
      `SELECT COUNT(*) AS table_count
       FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
      [EXPECTED_DB]
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          database: databaseName,
          tableCount: Number(tableRows?.[0]?.table_count || 0),
          message: "E2E database guard passed",
        },
        null,
        2
      )
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`E2E REFUSED: ${error.message || error}`);
  process.exit(2);
});
