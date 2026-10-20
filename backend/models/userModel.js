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

    // Known legacy codes resolve to the canonical worker account first.
    // If an active alias exists but its target is invalid/inactive, fail closed:
    // never fall back to the duplicate legacy workers row.
    db.query(
        `
        SELECT
            u.id, u.username, u.password, u.full_name, u.role, u.status,
            w.id AS worker_id, w.worker_code, w.status AS worker_status
        FROM worker_code_aliases a
        LEFT JOIN workers w ON w.id = a.worker_id
        LEFT JOIN users u ON u.id = w.user_id
        WHERE a.alias_code = ? AND a.status = 'active'
        ORDER BY u.id
        LIMIT 2
        `,
        [normalized],
        (aliasError, aliasRows) => {
            if (aliasError) return callback(aliasError);

            if (aliasRows.length > 0) {
                if (
                    aliasRows.length === 1 &&
                    aliasRows[0].id &&
                    aliasRows[0].worker_id &&
                    String(aliasRows[0].status).toLowerCase() === "active" &&
                    String(aliasRows[0].worker_status).toLowerCase() === "active"
                ) {
                    return callback(null, aliasRows);
                }
                return callback(null, []);
            }

            // No alias: preserve the indexed exact worker-code lookup.
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

                    // Legacy numeric compatibility only: e.g. 0599/599.
                    // This runs only after both alias and indexed exact lookups miss.
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