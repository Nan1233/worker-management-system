const db = require("../config/db");



// =====================================================
// LẤY TẤT CẢ USER
// =====================================================

const findAll = (callback) => {

    db.query(

        `
        SELECT 
            id,
            username,
            full_name,
            role
        FROM users
        `,

        callback

    );

};





// =====================================================
// LẤY USER THEO ID
// =====================================================

const findById = (id, callback) => {


    db.query(

        `
        SELECT 
            id,
            username,
            full_name,
            role
        FROM users
        WHERE id = ?
        `,

        [id],

        callback

    );

};







// =====================================================
// LOGIN
// LẤY THÊM worker_id
// =====================================================

const findExactByUsername = (username, callback) => {
    const normalized = String(username || "").trim();
    db.query(
        `
        SELECT
            u.id, u.username, u.password, u.full_name, u.role, u.status,
            w.id AS worker_id, w.worker_code, w.status AS worker_status
        FROM users u
        LEFT JOIN workers w ON u.id = w.user_id
        WHERE u.username = ?
        ORDER BY u.id
        LIMIT 2
        `,
        [normalized],
        callback
    );
};

const findAllByWorkerCode = (workerCode, callback) => {
    const normalized = String(workerCode || "").trim();

    // Common path: exact worker code can use uq_workers_code directly.
    db.query(
        `
        SELECT
            u.id, u.username, u.password, u.full_name, u.role, u.status,
            w.id AS worker_id, w.worker_code, w.status AS worker_status
        FROM workers w
        INNER JOIN users u ON u.id = w.user_id
        WHERE w.worker_code = ?
        ORDER BY u.id
        `,
        [normalized],
        (error, rows) => {
            if (error) return callback(error);
            if (rows.length || !/^[0-9]+$/.test(normalized)) return callback(null, rows);

            // Legacy compatibility only: numeric-equivalent codes such as 0599/599.
            // This fallback may scan, but it is executed only after the indexed exact
            // lookup misses and keeps the historical ambiguity detection contract.
            db.query(
                `
                SELECT
                    u.id, u.username, u.password, u.full_name, u.role, u.status,
                    w.id AS worker_id, w.worker_code, w.status AS worker_status
                FROM workers w
                INNER JOIN users u ON u.id = w.user_id
                WHERE w.worker_code REGEXP '^[0-9]+$'
                  AND CAST(w.worker_code AS UNSIGNED) = CAST(? AS UNSIGNED)
                ORDER BY u.id
                `,
                [normalized],
                callback
            );
        }
    );
};


// Tương thích cho code cũ: chỉ tìm chính xác username.
const findByUsername = findExactByUsername;


// =====================================================
// TẠO USER
// =====================================================

const createUser = (user, callback) => {


    const sql = `

    INSERT INTO users

    (

        username,

        password,

        full_name,

        role

    )

    VALUES(?,?,?,?)

    `;



    db.query(

        sql,


        [

            user.username,

            user.password,

            user.full_name,

            user.role

        ],


        callback

    );


};






module.exports = {


    findAll,

    findById,

    findByUsername,
    findExactByUsername,
    findAllByWorkerCode,

    createUser


};