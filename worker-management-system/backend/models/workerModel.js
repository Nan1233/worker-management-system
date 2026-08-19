const db =
    require("../config/db");


// =====================================================
// LẤY TẤT CẢ NHÂN VIÊN
// =====================================================

const findAll = (
    callback
) => {

    const sql = `

        SELECT

            w.id AS worker_id,

            w.user_id,

            w.worker_code,

            w.phone,

            w.department,

            w.position,

            w.training_percent,

            w.status,

            w.created_at,

            w.updated_at,

            u.username,

            u.full_name,

            u.role

        FROM workers AS w

        INNER JOIN users AS u
            ON w.user_id = u.id

        ORDER BY

            CASE
                WHEN w.status = 'active'
                THEN 0
                ELSE 1
            END,

            u.full_name ASC,

            w.worker_code ASC

    `;


    db.query(
        sql,
        callback
    );

};


// =====================================================
// LẤY WORKER THEO USER ID
// =====================================================

const getWorkerByUserId = (
    userId
) => {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const sql = `

                SELECT

                    w.id AS worker_id,

                    w.user_id,

                    w.worker_code,

                    w.phone,

                    w.department,

                    w.position,

                    w.training_percent,

                    w.status,

                    w.created_at,

                    w.updated_at,

                    u.full_name,

                    u.username,

                    u.role

                FROM workers AS w

                INNER JOIN users AS u
                    ON w.user_id = u.id

                WHERE w.user_id = ?

                LIMIT 1

            `;


            db.query(
                sql,
                [
                    userId
                ],
                (
                    err,
                    result
                ) => {

                    if (err) {

                        reject(
                            err
                        );

                        return;

                    }


                    resolve(
                        result[0]
                        ||
                        null
                    );

                }
            );

        }
    );

};


// =====================================================
// TẠO WORKER
// =====================================================

const create = (
    data,
    callback
) => {

    const sql = `

        INSERT INTO workers
        (
            user_id,

            worker_code,

            phone,

            department,

            position,

            training_percent,

            status
        )

        VALUES
        (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
        )

    `;


    db.query(
        sql,
        [
            data.user_id,

            data.worker_code,

            data.phone
            ??
            null,

            data.department
            ??
            "Sản xuất",

            data.position
            ??
            "Công nhân",

            data.training_percent
            ??
            100,

            data.status
            ??
            "active"
        ],
        callback
    );

};


// =====================================================
// CẬP NHẬT % HỌC VIỆC
// =====================================================

const updateTrainingPercent = (
    workerId,
    trainingPercent,
    callback
) => {

    const sql = `

        UPDATE workers

        SET

            training_percent = ?,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE id = ?

    `;


    db.query(
        sql,
        [
            trainingPercent,

            workerId
        ],
        callback
    );

};


module.exports = {

    findAll,

    getWorkerByUserId,

    create,

    updateTrainingPercent

};