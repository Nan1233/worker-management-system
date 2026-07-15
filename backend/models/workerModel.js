const db = require("../config/db");



// ======================================
// LẤY DANH SÁCH WORKER
// ======================================

const findAll = (callback)=>{


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


    ORDER BY workers.id DESC


    `;



    db.query(

        sql,

        callback

    );


};









// ======================================
// TẠO WORKER
// ======================================

const create = (worker,callback)=>{


    const sql = `


    INSERT INTO workers

    (

        user_id,

        worker_code,

        phone,

        department

    )


    VALUES (?,?,?,?)


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









// ======================================
// LẤY WORKER THEO USER LOGIN
// Dùng Promise cho async/await
// ======================================

const getWorkerByUserId = (user_id)=>{

return new Promise((resolve,reject)=>{


const sql=`

SELECT

workers.id,

workers.worker_code,

users.full_name AS worker_name


FROM workers


JOIN users

ON workers.user_id = users.id


WHERE workers.user_id=?

`;


db.query(

sql,

[user_id],

(err,result)=>{


if(err)
return reject(err);


resolve(result[0]);


}

);


});


};









module.exports = {


    findAll,


    create,


    getWorkerByUserId


};