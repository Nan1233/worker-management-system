require("dotenv").config();
const fs = require("fs");
const zlib = require("zlib");
const mysql = require("mysql2/promise");

const quoteId = (value) => `\`${String(value).replace(/`/g, "``")}\``;

(async () => {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) throw new Error("Dùng: node scripts/restoreDatabase.js <file.json.gz>");
  if (process.env.ALLOW_DB_RESTORE !== "YES") throw new Error("Đặt ALLOW_DB_RESTORE=YES để xác nhận phục hồi");
  const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 4000),
    ssl: process.env.DB_SSL === "false" ? undefined : { rejectUnauthorized: true },
  });
  await connection.beginTransaction();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS=0");
    for (const [table, rows] of Object.entries(data.tables || {})) {
      await connection.query(`DELETE FROM ${quoteId(table)}`);
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const sql = `INSERT INTO ${quoteId(table)} (${columns.map(quoteId).join(",")}) VALUES ?`;
      await connection.query(sql, [rows.map((row) => columns.map((column) => row[column]))]);
      console.log(table, rows.length);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
    await connection.commit();
    console.log("RESTORE_OK");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
})().catch((error) => {
  console.error("RESTORE_FAILED", error);
  process.exit(1);
});
