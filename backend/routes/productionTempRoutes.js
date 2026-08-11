const express = require("express");

const router = express.Router();

const authMiddleware = require(
    "../middleware/authMiddleware"
);

const checkRole = require(
    "../middleware/roleMiddleware"
);
const permission = require("../middleware/permissionMiddleware");

const controller = require(
    "../controllers/productionTempController"
);
const validate = require("../middleware/validateRequest");


// =====================================================
// WORKER TẠO BÁO CÁO CHỜ DUYỆT
// =====================================================

router.post(
    "/",
    authMiddleware,
    checkRole("worker"),
    permission("WORKER_ENTRY"),
    validate({ process_id:{required:true,type:"positiveInt"}, work_date:{required:true}, shift:{required:true,maxLength:20}, machine_no:{required:false,maxLength:100}, product_name:{required:true,maxLength:150} }),
    controller.createTempReport
);

router.post(
    "/check-similar",
    authMiddleware,
    checkRole("worker"),
    permission("WORKER_ENTRY"),
    validate({ process_id:{required:true,type:"positiveInt"}, work_date:{required:true}, shift:{required:true,maxLength:20}, machine_no:{required:false,maxLength:100}, product_name:{required:true,maxLength:150} }),
    controller.checkSimilarReport
);


// =====================================================
// WORKER XEM BÁO CÁO CỦA MÌNH
// =====================================================

router.get(
    "/my",
    authMiddleware,
    checkRole("worker"),
    permission("WORKER_HISTORY"),
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
    permission("REPORT_PENDING_VIEW"),
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
    permission("REPORT_APPROVED_VIEW"),
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
    permission("REPORT_PENDING_VIEW"),
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
    permission("REPORT_PENDING_VIEW"),
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
    validate({ ids:{required:true,type:"array",itemType:"positiveInt",minItems:1,maxItems:100,unique:true} }),
    permission("REPORT_APPROVE"),
    controller.approveSelectedReports
);


// =====================================================
// GIỮ ROUTE CŨ ĐỂ TRÁNH LỖI CODE CŨ
// Có thể xóa sau khi toàn bộ frontend dùng approve-selected
// =====================================================

router.post(
    "/reject-selected",
    authMiddleware,
    checkRole(
        "admin",
        "manager",
        "lead"
    ),
    validate({
        ids:{required:true,type:"array",itemType:"positiveInt",minItems:1,maxItems:100,unique:true},
        reason:{required:true,type:"string",minLength:2,maxLength:500}
    }),
    permission("REPORT_APPROVE"),
    controller.rejectSelectedReports
);


router.post(
    "/approve",
    authMiddleware,
    checkRole(
        "admin",
        "manager",
        "lead"
    ),
    permission("REPORT_APPROVE"),
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
    permission("AUDIT_VIEW"),
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
        "manager",
        "worker"
    ),
    validate({ id:{in:"params",required:true,type:"positiveInt"} }),
    permission("REPORT_PENDING_EDIT", "WORKER_ENTRY"),
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
    permission("REPORT_PENDING_VIEW", "WORKER_HISTORY"),
    controller.getTempReportDetail
);


module.exports = router;