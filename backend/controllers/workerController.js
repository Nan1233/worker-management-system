const workerModel =
    require("../models/workerModel");

const db =
    require("../config/db");

const { assertUserManagementScope } = require("../services/processAuthorizationService");

const { getOrLoadWorkerProfile } =
    require("../utils/workerProfileCache");

const { createWorkerProfileLoader, createDatabaseQuery } =
    require("../services/currentWorkerProfileService");

const workerProfileLoader = createWorkerProfileLoader({
    query: createDatabaseQuery(db)
});

const loadCurrentWorkerProfile = workerProfileLoader.loadByUserId;

exports.getCurrentWorker = async (req, res) => {
    const loginUserId = Number(req.user?.id);
    if (!Number.isInteger(loginUserId) || loginUserId <= 0) {
        return res.status(401).json({
            success: false,
            message: "Phiên đăng nhập không hợp lệ"
        });
    }

    try {
        const worker = await loadCurrentWorkerProfile(loginUserId);

        if (!worker) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy hồ sơ công nhân"
            });
        }

        return res.status(200).json({
            success: true,
            data: worker
        });
    } catch (error) {
        console.error("GET CURRENT WORKER ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể lấy hồ sơ công nhân"
        });
    }
};


// Role gating for management endpoints is not kept as a local list any more:
// authorization goes through assertUserManagementScope, which checks the role
// AND the process the actor actually owns.


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

exports.getAllWorkers = async (req, res) => {
    try {
        const role = String(req.user?.role || '').toLowerCase();
        let rows;
        if (role === 'admin') {
            [rows] = await db.promise().query(`
                SELECT w.id AS worker_id,w.user_id,w.worker_code,w.phone,w.department,w.position,
                       w.training_percent,w.status,w.created_at,w.updated_at,u.username,u.full_name,u.role
                FROM workers w INNER JOIN users u ON w.user_id=u.id
                ORDER BY CASE WHEN w.status='active' THEN 0 ELSE 1 END,u.full_name ASC,w.worker_code ASC
            `);
        } else {
            [rows] = await db.promise().query(`
                SELECT DISTINCT w.id AS worker_id,w.user_id,w.worker_code,w.phone,w.department,w.position,
                       w.training_percent,w.status,w.created_at,w.updated_at,u.username,u.full_name,u.role
                FROM workers w
                INNER JOIN users u ON w.user_id=u.id
                INNER JOIN worker_processes wp ON wp.worker_id=w.id
                INNER JOIN manager_processes mp ON mp.process_id=wp.process_id AND mp.manager_id=?
                ORDER BY CASE WHEN w.status='active' THEN 0 ELSE 1 END,u.full_name ASC,w.worker_code ASC
            `, [Number(req.user?.id)]);
        }
        return res.status(200).json({ success:true, data:rows });
    } catch (error) {
        console.error("GET ALL WORKERS ERROR:",error);
        return res.status(500).json({ success:false,message:"Không thể lấy danh sách nhân viên" });
    }
};


exports.updateTrainingPercent = async (req, res) => {
    const workerId=Number(req.params.workerId);
    if(!Number.isInteger(workerId)||workerId<=0) return res.status(400).json({success:false,message:"ID nhân viên không hợp lệ"});
    const trainingPercent=parseTrainingPercent(req.body.training_percent);
    if(trainingPercent===null) return res.status(400).json({success:false,message:"% học việc phải nằm trong khoảng từ 0 đến 100"});
    try {
        await assertUserManagementScope(req.user,{id:workerId,role:'worker',worker_id:workerId},{action:'WORKER_TRAINING_PERCENT_UPDATE'});
        await new Promise((resolve,reject)=>workerModel.updateTrainingPercent(workerId,trainingPercent,(err,result)=>err?reject(err):resolve(result)));
        return res.status(200).json({success:true,message:"Cập nhật % học việc thành công",data:{worker_id:workerId,training_percent:trainingPercent}});
    } catch(error) {
        if(error?.status===403) return res.status(403).json({success:false,code:error.code||'PROCESS_SCOPE_FORBIDDEN',message:error.message});
        console.error("UPDATE TRAINING PERCENT ERROR:",error);
        return res.status(500).json({success:false,message:"Không thể cập nhật % học việc"});
    }
};


// =====================================================
// LẤY CHI TIẾT NHÂN VIÊN
// GET /api/workers/:workerId
// Chính chủ, hoặc role quản lý TRONG phạm vi công đoạn phụ trách
// =====================================================

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
        const isOwnProfile = Number.isInteger(loginUserId) && loginUserId === Number(profile.user_id);

        // The route only applies verifyToken, so every authorization decision for
        // this endpoint is made here. Self-access stays open; management roles are
        // scoped to the processes they actually own, matching the contract that
        // updateTrainingPercent and getAllWorkers enforce. A bare role check would
        // let any manager or lead read workers outside their own processes.
        if (!isOwnProfile) {
            await assertUserManagementScope(
                req.user,
                { id: profile.user_id, role: "worker", worker_id: workerId },
                { action: "WORKER_DETAIL_VIEW" }
            );
        }

        return res.status(200).json({ success: true, data: profile });
    } catch (error) {
        if (error?.status === 403) {
            return res.status(403).json({
                success: false,
                code: error.code || "PROCESS_SCOPE_FORBIDDEN",
                message: error.message || "Bạn không có quyền xem nhân viên này"
            });
        }
        console.error("GET WORKER BY ID ERROR:", error);
        return res.status(500).json({ success: false, message: "Không thể lấy thông tin nhân viên" });
    }
};


// =====================================================
// TẠO NHÂN VIÊN
// POST /api/workers
// CHỈ ADMIN (chặn ở route: checkRole("admin") + permission("USER_CREATE"))
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
