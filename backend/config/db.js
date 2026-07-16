const mysql = require("mysql2");

require("dotenv").config();

const dbPort = Number(process.env.DB_PORT || 3306);
const useSsl = process.env.DB_SSL === "true";

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: dbPort,

    ...(useSsl
        ? {
            ssl: {
                rejectUnauthorized:
                    process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false"
            }
        }
        : {}),

    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0
});

pool.getConnection((err, connection) => {
    if (err) {
        console.error(
            "❌ Database connection failed:",
            err.message
        );
        return;
    }

    console.log("✅ MySQL/TiDB Connected");
    connection.release();
});

module.exports = pool;
