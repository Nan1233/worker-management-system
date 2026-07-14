const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");


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
    createTempReport
);





// =====================================
// WORKER XEM LỊCH SỬ
// GET /api/temp-reports/my
// =====================================

router.get(
    "/my",
    authMiddleware,
    getMyTempReports
);






// =====================================
// MANAGER XEM CHỜ DUYỆT
// =====================================

router.get(
    "/pending",
    authMiddleware,
    getPendingReports
);






// =====================================
// MANAGER XEM ĐÃ DUYỆT
// =====================================

router.get(
    "/approved",
    authMiddleware,
    getApprovedReports
);






// =====================================
// LẤY DANH SÁCH NGÀY
// =====================================

router.get(
    "/dates",
    authMiddleware,
    getTempDates
);






// =====================================
// XEM BÁO CÁO THEO NGÀY
// =====================================

router.get(
    "/by-date",
    authMiddleware,
    getTempReportsByDate
);






// =====================================
// DUYỆT THEO NGÀY
// =====================================

router.post(
    "/approve-date",
    authMiddleware,
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