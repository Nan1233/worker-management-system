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
};exports.updateTrainingPercent = async (req, res) => {
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
};;