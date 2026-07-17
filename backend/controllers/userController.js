const bcrypt = require("bcrypt");

const userModel =
    require("../models/userModel");

const workerModel =
    require("../models/workerModel");


// =====================================================
// LẤY TẤT CẢ USER
// GET /api/users
// =====================================================

exports.getAllUsers = (
    req,
    res
) => {

    userModel.findAll(
        (
            error,
            results
        ) => {

            if (error) {

                return res
                    .status(500)
                    .json({
                        success: false,
                        message:
                            error.message ||
                            "Không thể lấy danh sách người dùng"
                    });

            }

            return res
                .status(200)
                .json({
                    success: true,
                    data: results
                });

        }
    );

};


// =====================================================
// LẤY CHI TIẾT USER
// GET /api/users/:id
// =====================================================

exports.getUserById = (
    req,
    res
) => {

    const userId =
        Number(req.params.id);

    if (
        !Number.isInteger(userId) ||
        userId <= 0
    ) {

        return res
            .status(400)
            .json({
                success: false,
                message:
                    "ID người dùng không hợp lệ"
            });

    }

    userModel.findById(
        userId,
        (
            error,
            results
        ) => {

            if (error) {

                return res
                    .status(500)
                    .json({
                        success: false,
                        message:
                            error.message ||
                            "Không thể lấy thông tin người dùng"
                    });

            }

            if (
                !Array.isArray(results) ||
                results.length === 0
            ) {

                return res
                    .status(404)
                    .json({
                        success: false,
                        message:
                            "Người dùng không tồn tại"
                    });

            }

            return res
                .status(200)
                .json({
                    success: true,
                    data: results[0]
                });

        }
    );

};


// =====================================================
// TẠO USER
// POST /api/users
// =====================================================

exports.createUser = async (
    req,
    res
) => {

    try {

        const {
            username,
            password,
            full_name,
            role,
            worker_code,
            phone,
            department
        } = req.body || {};


        if (
            !String(username || "").trim() ||
            !String(password || "").trim() ||
            !String(full_name || "").trim() ||
            !String(role || "").trim()
        ) {

            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        "Thiếu dữ liệu bắt buộc"
                });

        }


        const allowedRoles = [
            "admin",
            "manager",
            "lead",
            "worker"
        ];


        if (
            !allowedRoles.includes(role)
        ) {

            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        "Role không hợp lệ"
                });

        }


        userModel.findByUsername(
            username.trim(),
            async (
                error,
                results
            ) => {

                if (error) {

                    return res
                        .status(500)
                        .json({
                            success: false,
                            message:
                                error.message ||
                                "Không thể kiểm tra username"
                        });

                }


                if (
                    Array.isArray(results) &&
                    results.length > 0
                ) {

                    return res
                        .status(409)
                        .json({
                            success: false,
                            message:
                                "Username đã tồn tại"
                        });

                }


                try {

                    const hashedPassword =
                        await bcrypt.hash(
                            password,
                            10
                        );


                    userModel.createUser(
                        {
                            username:
                                username.trim(),

                            password:
                                hashedPassword,

                            full_name:
                                full_name.trim(),

                            role
                        },
                        (
                            createError,
                            result
                        ) => {

                            if (createError) {

                                return res
                                    .status(500)
                                    .json({
                                        success: false,
                                        message:
                                            createError.message ||
                                            "Không thể tạo người dùng"
                                    });

                            }


                            const userId =
                                result.insertId;


                            if (
                                role !== "worker"
                            ) {

                                return res
                                    .status(201)
                                    .json({
                                        success: true,
                                        message:
                                            "Tạo người dùng thành công",
                                        data: {
                                            user_id:
                                                userId
                                        }
                                    });

                            }


                            workerModel.create(
                                {
                                    user_id:
                                        userId,

                                    worker_code:
                                        String(
                                            worker_code ||
                                            `CN${userId}`
                                        ).trim(),

                                    phone:
                                        phone || null,

                                    department:
                                        department || null
                                },
                                workerError => {

                                    if (
                                        workerError
                                    ) {

                                        return res
                                            .status(500)
                                            .json({
                                                success: false,
                                                message:
                                                    workerError.message ||
                                                    "Đã tạo tài khoản nhưng không thể tạo thông tin công nhân"
                                            });

                                    }


                                    return res
                                        .status(201)
                                        .json({
                                            success: true,
                                            message:
                                                "Tạo công nhân thành công",
                                            data: {
                                                user_id:
                                                    userId
                                            }
                                        });

                                }
                            );

                        }
                    );

                } catch (
                    hashError
                ) {

                    return res
                        .status(500)
                        .json({
                            success: false,
                            message:
                                hashError.message ||
                                "Không thể mã hóa mật khẩu"
                        });

                }

            }
        );

    } catch (error) {

        return res
            .status(500)
            .json({
                success: false,
                message:
                    error.message ||
                    "Không thể tạo người dùng"
            });

    }

};