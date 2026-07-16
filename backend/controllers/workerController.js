const workerModel = require("../models/workerModel");
const db = require("../config/db");


// =====================================================
// LẤY TẤT CẢ NHÂN VIÊN
// ADMIN / MANAGER / LEAD
// =====================================================

exports.getAllWorkers = (req, res) => {

    workerModel.findAll((err, result) => {

        if (err) {

            console.error(
                "GET ALL WORKERS ERROR:",
                err
            );

            return res.status(500).json({
                success: false,
                message: "Không thể lấy danh sách nhân viên"
            });

        }

        return res.status(200).json({
            success: true,
            data: result
        });

    });

};


// =====================================================
// TẠO NHÂN VIÊN
// ADMIN
// =====================================================

exports.createWorker = (req, res) => {

    const {
        user_id,
        worker_code,
        phone,
        department
    } = req.body;


    if (!user_id || !worker_code) {

        return res.status(400).json({
            success: false,
            message: "Thiếu user_id hoặc worker_code"
        });

    }


    workerModel.create(
        {
            user_id,
            worker_code,
            phone,
            department
        },
        (err, result) => {

            if (err) {

                console.error(
                    "CREATE WORKER ERROR:",
                    err
                );


                if (err.code === "ER_DUP_ENTRY") {

                    return res.status(409).json({
                        success: false,
                        message: "User hoặc mã nhân viên đã tồn tại"
                    });

                }


                return res.status(500).json({
                    success: false,
                    message: "Không thể tạo nhân viên"
                });

            }


            return res.status(201).json({
                success: true,
                message: "Tạo nhân viên thành công",
                data: {
                    id: result.insertId
                }
            });

        }
    );

};


// =====================================================
// LẤY THÔNG TIN WORKER THEO USER ID
// GET /api/workers/:id
// =====================================================

exports.getWorkerById = (req, res) => {

    const userId = Number(req.params.id);


    if (!Number.isInteger(userId) || userId <= 0) {

        return res.status(400).json({
            success: false,
            message: "ID người dùng không hợp lệ"
        });

    }


    /*
        Worker chỉ được xem thông tin của chính mình.

        Admin, manager và lead được phép xem người khác.
    */

    const loginUserId = Number(req.user.id);
    const loginRole = req.user.role;

    const managementRoles = [
        "admin",
        "manager",
        "lead"
    ];


    const isOwnProfile =
        loginUserId === userId;

    const isManagement =
        managementRoles.includes(loginRole);


    if (!isOwnProfile && !isManagement) {

        return res.status(403).json({
            success: false,
            message: "Bạn không có quyền xem nhân viên này"
        });

    }


    const sql = `

        SELECT

            w.id AS worker_id,

            w.user_id,

            w.worker_code,

            w.phone,

            w.department,

            w.status,

            w.created_at,

            u.username,

            u.full_name,

            u.role

        FROM workers AS w

        INNER JOIN users AS u
            ON w.user_id = u.id

        WHERE w.user_id = ?

        LIMIT 1

    `;


    db.query(
        sql,
        [userId],
        (err, result) => {

            if (err) {

                console.error(
                    "GET WORKER BY USER ID ERROR:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message: "Không thể lấy thông tin nhân viên"
                });

            }


            if (result.length === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Tài khoản chưa có hồ sơ nhân viên"
                });

            }


            return res.status(200).json({
                success: true,
                data: result[0]
            });

        }
    );

};