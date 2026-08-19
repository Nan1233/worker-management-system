const workerModel =
    require("../models/workerModel");

const db =
    require("../config/db");

const { getOrLoadWorkerProfile } =
    require("../utils/workerProfileCache");

const { createWorkerProfileLoader, createDatabaseQuery } =
    require("../services/currentWorkerProfileService");

const workerProfileLoader = createWorkerProfileLoader({
    query: createDatabaseQuery(db)
});

const loadCurrentWorkerProfile = workerProfileLoader.loadByUserId;


// =====================================================
// ROLE ĐƯỢC QUẢN LÝ NHÂN VIÊN
// =====================================================

const MANAGEMENT_ROLES = [

    "admin",

    "manager",

    "lead"

];


// =====================================================
// KIỂM TRA % HỌC VIỆC
// =====================================================

const parseTrainingPercent = (
    value
) => {

    if (
        value === ""
        ||
        value === null
        ||
        value === undefined
    ) {

        return null;

    }


    const trainingPercent =
        Number(
            value
        );


    if (
        !Number.isFinite(
            trainingPercent
        )
        ||
        trainingPercent < 0
        ||
        trainingPercent > 100
    ) {

        return null;

    }


    return trainingPercent;

};


// =====================================================
// LẤY TẤT CẢ NHÂN VIÊN
// GET /api/workers
// ADMIN / MANAGER / LEAD
// =====================================================

exports.getAllWorkers = (
    req,
    res
) => {

    workerModel.findAll(
        (
            err,
            result
        ) => {

            if (err) {

                console.error(
                    "GET ALL WORKERS ERROR:",
                    err
                );


                return res.status(500).json({

                    success:
                        false,

                    message:
                        "Không thể lấy danh sách nhân viên"

                });

            }


            return res.status(200).json({

                success:
                    true,

                data:
                    result

            });

        }
    );

};


// =====================================================
// TẠO NHÂN VIÊN
// POST /api/workers
// ADMIN
// =====================================================

exports.createWorker = (
    req,
    res
) => {

    const {

        user_id,

        worker_code,

        phone,

        department,

        position,

        training_percent,

        status

    } = req.body;


    const userId =
        Number(
            user_id
        );


    const workerCode =
        String(
            worker_code
            ||
            ""
        ).trim();


    if (
        !Number.isInteger(
            userId
        )
        ||
        userId <= 0
        ||
        !workerCode
    ) {

        return res.status(400).json({

            success:
                false,

            message:
                "Thiếu hoặc sai user_id, worker_code"

        });

    }


    const trainingPercent =

        training_percent === undefined
        ||
        training_percent === null
        ||
        training_percent === ""

            ? 100

            : parseTrainingPercent(
                training_percent
            );


    if (
        trainingPercent === null
    ) {

        return res.status(400).json({

            success:
                false,

            message:
                "% học việc phải nằm trong khoảng từ 0 đến 100"

        });

    }


    const workerStatus =
        status === "inactive"

            ? "inactive"

            : "active";


    workerModel.create(
        {

            user_id:
                userId,

            worker_code:
                workerCode,

            phone:
                phone
                    ? String(
                        phone
                    ).trim()
                    : null,

            department:
                department
                    ? String(
                        department
                    ).trim()
                    : "Sản xuất",

            position:
                position
                    ? String(
                        position
                    ).trim()
                    : "Công nhân",

            training_percent:
                trainingPercent,

            status:
                workerStatus

        },
        (
            err,
            result
        ) => {

            if (err) {

                console.error(
                    "CREATE WORKER ERROR:",
                    err
                );


                if (
                    err.code ===
                    "ER_DUP_ENTRY"
                ) {

                    return res.status(409).json({

                        success:
                            false,

                        message:
                            "User hoặc mã nhân viên đã tồn tại"

                    });

                }


                return res.status(500).json({

                    success:
                        false,

                    message:
                        "Không thể tạo nhân viên"

                });

            }


            return res.status(201).json({

                success:
                    true,

                message:
                    "Tạo nhân viên thành công",

                data: {

                    id:
                        result.insertId

                }

            });

        }
    );

};


// =====================================================
// LẤY THÔNG TIN WORKER THEO USER ID
// GET /api/workers/:id
//
// :id ở endpoint này là user_id.
// =====================================================

exports.getCurrentWorker = async (req, res) => {

    const loginUserId = Number(req.user?.id);

    if (!Number.isInteger(loginUserId) || loginUserId <= 0) {
        return res.status(401).json({
            success: false,
            message: "Thông tin đăng nhập không hợp lệ"
        });
    }

    try {
        const profile = await getOrLoadWorkerProfile(
            loginUserId,
            () => loadCurrentWorkerProfile(loginUserId)
        );

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: "Tài khoản chưa có hồ sơ công nhân đang hoạt động"
            });
        }

        return res.status(200).json({
            success: true,
            data: profile
        });
    } catch (error) {
        console.error("GET CURRENT WORKER ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể lấy thông tin nhân viên"
        });
    }
};

exports.getWorkerById = async (req, res) => {
    const workerId = Number(req.params.workerId);

    if (!Number.isInteger(workerId) || workerId <= 0) {
        return res.status(400).json({ success: false, message: "ID nhân viên không hợp lệ" });
    }

    try {
        const profile = await workerProfileLoader.loadByWorkerId(workerId, { activeOnly: false });

        if (!profile) {
            return res.status(404).json({ success: false, message: "Không tìm thấy nhân viên" });
        }

        const loginUserId = Number(req.user?.id);
        const loginRole = req.user?.role;
        const isOwnProfile = loginUserId === Number(profile.user_id);
        const isManagement = MANAGEMENT_ROLES.includes(loginRole);

        if (!isOwnProfile && !isManagement) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền xem nhân viên này" });
        }

        return res.status(200).json({ success: true, data: profile });
    } catch (error) {
        console.error("GET WORKER BY ID ERROR:", error);
        return res.status(500).json({ success: false, message: "Không thể lấy thông tin nhân viên" });
    }
};

// =====================================================
// CẬP NHẬT RIÊNG % HỌC VIỆC
// PATCH /api/workers/:id/training-percent
//
// :id là worker_id.
// ADMIN / MANAGER / LEAD
// =====================================================

exports.updateTrainingPercent = (
    req,
    res
) => {

    const workerId =
        Number(
            req.params.workerId
        );


    if (
        !Number.isInteger(
            workerId
        )
        ||
        workerId <= 0
    ) {

        return res.status(400).json({

            success:
                false,

            message:
                "ID nhân viên không hợp lệ"

        });

    }


    const trainingPercent =
        parseTrainingPercent(
            req.body.training_percent
        );


    if (
        trainingPercent === null
    ) {

        return res.status(400).json({

            success:
                false,

            message:
                "% học việc phải nằm trong khoảng từ 0 đến 100"

        });

    }


    workerModel.updateTrainingPercent(
        workerId,
        trainingPercent,
        (
            err,
            result
        ) => {

            if (err) {

                console.error(
                    "UPDATE TRAINING PERCENT ERROR:",
                    err
                );


                return res.status(500).json({

                    success:
                        false,

                    message:
                        "Không thể cập nhật % học việc"

                });

            }


            if (
                result.affectedRows === 0
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "Không tìm thấy nhân viên"

                });

            }


            return res.status(200).json({

                success:
                    true,

                message:
                    "Cập nhật % học việc thành công",

                data: {

                    worker_id:
                        workerId,

                    training_percent:
                        trainingPercent

                }

            });

        }
    );

};