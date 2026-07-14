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

const findByUsername = (username, callback) => {


    db.query(

        `

        SELECT

            u.id,

            u.username,

            u.password,

            u.full_name,

            u.role,


            w.id AS worker_id


        FROM users u


        LEFT JOIN workers w

        ON u.id = w.user_id


        WHERE u.username = ?

        `,


        [username],


        callback

    );


};







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

    createUser


};