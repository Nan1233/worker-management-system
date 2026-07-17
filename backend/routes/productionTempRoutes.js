const express = require("express");

const router = express.Router();

const authMiddleware = require(
    "../middleware/authMiddleware"
);

const checkRole = require(
    "../middleware/roleMiddleware"
);

const controller = require(
    "../controllers/productionTempController"
);


// =====================================================
// WORKER TẠO BÁO CÁO CHỜ DUYỆT
// =====================================================

router.post(
    "/",
    authMiddleware,
    checkRole("worker"),
    controller.createTempReport
);


// =====================================================
// WORKER XEM BÁO CÁO CỦA MÌNH
// =====================================================

router.get(
    "/my",
    authMiddleware,
    checkRole("worker"),
    controller.getMyTempReports
);


// =====================================================
// LEAD / MANAGER / ADMIN XEM BÁO CÁO CHỜ DUYỆT
// =====================================================

router.get(
    "/pending",
    authMiddleware,
    checkRole(
        "admin",
        "manager",
        "lead"
    ),
    controller.getPendingReports
);


// =====================================================
// LEAD / MANAGER / ADMIN XEM BÁO CÁO ĐÃ DUYỆT
// =====================================================

router.get(
    "/approved",
    authMiddleware,
    checkRole(
        "admin",
        "manager",
        "lead"
    ),
    controller.getApprovedReports
);


// =====================================================
// LẤY DANH SÁCH NGÀY CÓ BÁO CÁO CHỜ DUYỆT
// =====================================================

router.get(
    "/dates",
    authMiddleware,
    checkRole(
        "admin",
        "manager",
        "lead"
    ),
    controller.getTempDates
);


// =====================================================
// LẤY BÁO CÁO CHỜ DUYỆT THEO NGÀY
// =====================================================

router.get(
    "/by-date",
    authMiddleware,
    checkRole(
        "admin",
        "manager",
        "lead"
    ),
    controller.getTempReportsByDate
);


// =====================================================
// DUYỆT CÁC BÁO CÁO ĐÃ CHỌN
// =====================================================

router.post(
    "/approve-selected",
    authMiddleware,
    checkRole(
        "admin",
        "manager",
        "lead"
    ),
    controller.approveSelectedReports
);


// =====================================================
// GIỮ ROUTE CŨ ĐỂ TRÁNH LỖI CODE CŨ
// Có thể xóa sau khi toàn bộ frontend dùng approve-selected
// =====================================================

router.post(
    "/approve",
    authMiddleware,
    checkRole(
        "admin",
        "manager",
        "lead"
    ),
    controller.approveSelectedReports
);


// =====================================================
// XEM NHẬT KÝ THAO TÁC CỦA BÁO CÁO
// =====================================================

router.get(
    "/:id/logs",
    authMiddleware,
    checkRole(
        "admin",
        "manager",
        "lead"
    ),
    controller.getReportActionLogs
);


// =====================================================
// MANAGER / ADMIN SỬA BÁO CÁO CHỜ DUYỆT
// Lead chỉ được xem và duyệt, không được sửa
// =====================================================

router.put(
    "/:id",
    authMiddleware,
    checkRole(
        "admin",
        "manager"
    ),
    controller.updateTempReport
);


// =====================================================
// XEM CHI TIẾT BÁO CÁO CHỜ DUYỆT
// =====================================================

router.get(
    "/:id",
    authMiddleware,
    checkRole(
        "admin",
        "manager",
        "lead",
        "worker"
    ),
    controller.getTempReportDetail
);


module.exports = router;