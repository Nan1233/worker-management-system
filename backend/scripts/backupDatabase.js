require("dotenv").config();
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const mysql = require("mysql2/promise");

const quoteId = (value) => `\`${String(value).replace(/`/g, "``")}\``;
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

(async () => {
  const out = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
  fs.mkdirSync(out, { recursive: true });
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 4000),
    ssl: process.env.DB_SSL === "false" ? undefined : { rejectUnauthorized: true },
  });
  const [tables] = await connection.query("SHOW FULL TABLES WHERE Table_type='BASE TABLE'");
  const names = tables.map((row) => Object.values(row)[0]);
  const payload = { format: "KTC_JSON_BACKUP_V1", created_at: new Date().toISOString(), database: process.env.DB_NAME, tables: {} };
  for (const name of names) {
    const [rows] = await connection.query(`SELECT * FROM ${quoteId(name)}`);
    payload.tables[name] = rows;
    console.log(name, rows.length);
  }
  const file = path.join(out, `ktc-${stamp()}.json.gz`);
  fs.writeFileSync(file, zlib.gzipSync(Buffer.from(JSON.stringify(payload))));
  await connection.end();
  console.log(`BACKUP_OK ${file}`);
})().catch((error) => {
  console.error("BACKUP_FAILED", error);
  process.exit(1);
});
