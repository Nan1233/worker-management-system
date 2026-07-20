const mysql = require("mysql2");
const dotenv = require("dotenv");

dotenv.config();


// =====================================================
// ĐỌC VÀ KIỂM TRA BIẾN MÔI TRƯỜNG
// =====================================================

const requiredVariables = [
    "DB_HOST",
    "DB_USER",
    "DB_PASSWORD",
    "DB_NAME"
];

const missingVariables = requiredVariables.filter(
    (variableName) => !process.env[variableName]
);

if (missingVariables.length > 0) {
    console.error(
        `❌ Thiếu biến môi trường database: ${missingVariables.join(", ")}`
    );
}


// =====================================================
// XÁC ĐỊNH CẤU HÌNH SSL
// =====================================================

const dbPort = Number(
    process.env.DB_PORT || 4000
);

const dbSslValue = String(
    process.env.DB_SSL || "true"
).toLowerCase();

const useSsl =
    dbSslValue === "true"
    || dbSslValue === "1"
    || dbSslValue === "yes";


// TiDB Cloud bắt buộc phải kết nối qua TLS.
// rejectUnauthorized=true giúp kiểm tra chứng chỉ máy chủ.

const sslConfig = useSsl
    ? {
        minVersion: "TLSv1.2",
        rejectUnauthorized: true
    }
    : undefined;


// =====================================================
// TẠO CONNECTION POOL
// =====================================================

const pool = mysql.createPool({

    host: process.env.DB_HOST,

    port: dbPort,

    user: process.env.DB_USER,

    password: process.env.DB_PASSWORD,

    database: process.env.DB_NAME,

    ssl: sslConfig,

    waitForConnections: true,

    connectionLimit: Number(
        process.env.DB_CONNECTION_LIMIT || 10
    ),

    maxIdle: Number(
        process.env.DB_MAX_IDLE || 10
    ),

    idleTimeout: Number(
        process.env.DB_IDLE_TIMEOUT || 60000
    ),

    queueLimit: 0,

    enableKeepAlive: true,

    keepAliveInitialDelay: 0,

    connectTimeout: Number(
        process.env.DB_CONNECT_TIMEOUT || 20000
    ),

    charset: "utf8mb4"

});


// =====================================================
// KIỂM TRA KẾT NỐI KHI BACKEND KHỞI ĐỘNG
// =====================================================

pool.getConnection((error, connection) => {

    if (error) {

        console.error(
            "❌ Database connection failed:",
            error.message
        );

        console.error(
            "Database error code:",
            error.code
        );

        console.error(
            "Database host:",
            process.env.DB_HOST
        );

        console.error(
            "Database port:",
            dbPort
        );

        console.error(
            "Database SSL:",
            useSsl
        );

        return;

    }

    console.log(
        "✅ Database connected successfully"
    );

    console.log(
        `✅ Database SSL enabled: ${useSsl}`
    );

    connection.release();

});


// =====================================================
// THEO DÕI LỖI CONNECTION POOL
// =====================================================

pool.on("connection", (connection) => {

    connection.on("error", (error) => {
        const reconnectableCodes = new Set([
            "PROTOCOL_CONNECTION_LOST",
            "ECONNRESET",
            "ETIMEDOUT"
        ]);

        if (reconnectableCodes.has(error.code)) {
            console.warn("Database connection was recycled by server; pool will reconnect automatically");
            return;
        }

        console.error(
            "❌ Database connection error:",
            error.message
        );
    });

});


module.exports = pool;