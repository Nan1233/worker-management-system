const express =
    require("express");

const router =
    express.Router();


const workerController =
    require("../controllers/workerController");

const verifyToken =
    require("../middleware/authMiddleware");

const checkRole =
    require("../middleware/roleMiddleware");



// =====================================================
// LẤY DANH SÁCH CÔNG NHÂN
// ADMIN / MANAGER / LEAD
// =====================================================

router.get(

    "/",

    verifyToken,

    checkRole(
        "admin",
        "manager",
        "lead"
    ),

    workerController.getAllWorkers

);


// =====================================================
// TẠO CÔNG NHÂN
// CHỈ ADMIN
// =====================================================

router.post(

    "/",

    verifyToken,

    checkRole(
        "admin"
    ),

    workerController.createWorker

);


// =====================================================
// CẬP NHẬT % HỌC VIỆC
// ADMIN / MANAGER / LEAD
//
// Phải đặt trước route "/:workerId"
// để tránh Express hiểu "training-percent" sai endpoint.
// =====================================================

router.patch(

    "/:workerId/training-percent",

    verifyToken,

    checkRole(
        "admin",
        "manager",
        "lead"
    ),

    workerController.updateTrainingPercent

);


// =====================================================
// LẤY WORKER THEO USER ID
//
// Worker chỉ xem chính mình.
// Admin / manager / lead xem người khác.
// Controller thực hiện kiểm tra quyền.
// =====================================================

router.get(

    "/me",

    verifyToken,

    workerController.getCurrentWorker

);


router.get(

    "/:workerId",

    verifyToken,

    workerController.getWorkerById

);


module.exports =
    router;