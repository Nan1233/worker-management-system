const db = require("../config/db");


const findAll = (callback) => {

    const sql = `
        SELECT 
            workers.id,
            workers.worker_code,
            workers.phone,
            workers.department,
            workers.status,
            users.username,
            users.full_name,
            users.role
        FROM workers
        INNER JOIN users
        ON workers.user_id = users.id
    `;


    db.query(sql, callback);

};



const create = (worker, callback) => {

    const sql = `
        INSERT INTO workers
        (
            user_id,
            worker_code,
            phone,
            department
        )
        VALUES (?, ?, ?, ?)
    `;


    db.query(
        sql,
        [
            worker.user_id,
            worker.worker_code,
            worker.phone,
            worker.department
        ],
        callback
    );

};



module.exports = {
    findAll,
    create
};