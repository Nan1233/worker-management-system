const mysql = require("mysql2");

require("dotenv").config();


const pool = mysql.createPool({

    host: process.env.DB_HOST,

    user: process.env.DB_USER,

    password: process.env.DB_PASSWORD,

    database: process.env.DB_NAME,


    port: process.env.DB_PORT || 4000,


    ssl: process.env.DB_SSL === "true"
        ? {
            rejectUnauthorized: true
        }
        : undefined,


    waitForConnections: true,

    connectionLimit: 10,

    queueLimit: 0

});



// test kết nối

pool.getConnection((err, connection)=>{


    if(err){

        console.error(
            "❌ Database connection failed:",
            err.message
        );


        return;

    }


    console.log(
        "✅ TiDB/MySQL Connected"
    );


    connection.release();


});



module.exports = pool;