const db = require("../config/db");


const findAll = (callback) => {

    db.query(
        "SELECT id, username, full_name, role FROM users",
        callback
    );

};



const findById = (id, callback) => {

    db.query(
        "SELECT id, username, full_name, role FROM users WHERE id = ?",
        [id],
        callback
    );

};



const findByUsername = (username, callback) => {

    db.query(
        "SELECT * FROM users WHERE username = ?",
        [username],
        callback
    );

};



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