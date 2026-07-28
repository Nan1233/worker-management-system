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
const validate = require("../middleware/validateRequest");
const { requireCompanyNetworkForWorker } = require("../middleware/companyNetworkMiddleware");


// =====================================================
// WORKER TẠO BÁO CÁO CHỜ DUYỆT
// =====================================================

router.post(
    "/",
    authMiddleware,
    checkRole("worker"),
    requireCompanyNetworkForWorker,
    validate({ process_id:{required:true,type:"positiveInt"}, work_date:{required:true}, shift:{required:true,maxLength:20}, machine_no:{required:true,maxLength:100}, product_name:{required:true,maxLength:150} }),
    controller.createTempReport
);

router.post(
    "/check-similar",
    authMiddleware,
    checkRole("worker"),
    requireCompanyNetworkForWorker,
    validate({ process_id:{required:true,type:"positiveInt"}, work_date:{required:true}, shift:{required:true,maxLength:20}, machine_no:{required:true,maxLength:100}, product_name:{required:true,maxLength:150} }),
    controller.checkSimilarReport
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
    validate({ ids:{required:true,type:"array",itemType:"positiveInt",minItems:1,maxItems:100,unique:true} }),
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
        "manager",
        "worker"
    ),
    requireCompanyNetworkForWorker,
    validate({ id:{in:"params",required:true,type:"positiveInt"} }),
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