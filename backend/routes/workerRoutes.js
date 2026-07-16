const express = require("express");

const router = express.Router();


const workerController =
    require("../controllers/workerController");

const verifyToken =
    require("../middleware/authMiddleware");

const checkRole =
    require("../middleware/roleMiddleware");


// =====================================================
// ADMIN / MANAGER / LEAD
// LẤY DANH SÁCH NHÂN VIÊN
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
// ADMIN TẠO NHÂN VIÊN
// =====================================================

router.post(
    "/",
    verifyToken,
    checkRole("admin"),
    workerController.createWorker
);


// =====================================================
// LẤY THÔNG TIN WORKER THEO USER ID
//
// Worker chỉ xem được chính mình.
// Admin / manager / lead có thể xem người khác.
// Việc kiểm tra nằm trong controller.
// =====================================================

router.get(
    "/:id",
    verifyToken,
    workerController.getWorkerById
);


module.exports = router;