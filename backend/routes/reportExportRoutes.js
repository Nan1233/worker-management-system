const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");


const {
    createTempReport,

    getTempDates,

    getTempReportsByDate,

    approveTempByDate,

    getTempReportDetail,

    getMyTempReports,

    getPendingReports,

    getApprovedReports

} = require("../controllers/productionTempController");




// =====================================
// WORKER GỬI BÁO CÁO TEMP
// POST /api/temp-reports
// =====================================

router.post(
    "/",
    authMiddleware,
    checkRole("worker"),
    createTempReport
);





// =====================================
// WORKER XEM LỊCH SỬ
// GET /api/temp-reports/my
// =====================================

router.get(
    "/my",
    authMiddleware,
    checkRole("worker"),
    getMyTempReports
);






// =====================================
// MANAGER XEM CHỜ DUYỆT
// =====================================

router.get(
    "/pending",
    authMiddleware,
    checkRole("admin", "manager", "lead"),
    getPendingReports
);






// =====================================
// MANAGER XEM ĐÃ DUYỆT
// =====================================

router.get(
    "/approved",
    authMiddleware,
    checkRole("admin", "manager", "lead"),
    getApprovedReports
);






// =====================================
// LẤY DANH SÁCH NGÀY
// =====================================

router.get(
    "/dates",
    authMiddleware,
    checkRole("admin", "manager", "lead"),
    getTempDates
);






// =====================================
// XEM BÁO CÁO THEO NGÀY
// =====================================

router.get(
    "/by-date",
    authMiddleware,
    checkRole("admin", "manager", "lead"),
    getTempReportsByDate
);






// =====================================
// DUYỆT THEO NGÀY
// =====================================

router.post(
    "/approve-date",
    authMiddleware,
    checkRole("admin", "manager", "lead"),
    approveTempByDate
);






// =====================================
// CHI TIẾT
// phải để cuối vì có :id
// =====================================

router.get(
    "/:id",
    authMiddleware,
    getTempReportDetail
);





module.exports = router;