const express = require("express");

const router = express.Router();


const {

    createTempReport,

    getTempDates,

    getTempReportsByDate,

    approveTempByDate,

    getTempReportById,

    getMyTempReports,

    getPendingReports,

    getApprovedReports


} = require("../controllers/productionTempController");



const verifyToken =
    require("../middleware/authMiddleware");





// ======================================
// WORKER GỬI BÁO CÁO
// ======================================

router.post(
    "/",
    verifyToken,
    createTempReport
);





// ======================================
// MANAGER XEM BÁO CÁO CHƯA DUYỆT
// ======================================

router.get(
    "/pending",
    verifyToken,
    getPendingReports
);





// ======================================
// MANAGER XEM BÁO CÁO ĐÃ DUYỆT
// ======================================

router.get(
    "/approved",
    verifyToken,
    getApprovedReports
);





// ======================================
// MANAGER LẤY DANH SÁCH NGÀY
// ======================================

router.get(
    "/dates",
    verifyToken,
    getTempDates
);





// ======================================
// MANAGER XEM DỮ LIỆU THEO NGÀY
// /production-temp/by-date?date=2026-04-01
// ======================================

router.get(
    "/by-date",
    verifyToken,
    getTempReportsByDate
);





// ======================================
// MANAGER DUYỆT TOÀN BỘ NGÀY
// ======================================

router.post(
    "/approve-date",
    verifyToken,
    approveTempByDate
);





// ======================================
// WORKER XEM LỊCH SỬ
// ======================================

router.get(
    "/my",
    verifyToken,
    getMyTempReports
);





// ======================================
// XEM CHI TIẾT
// LUÔN ĐỂ CUỐI CÙNG
// ======================================

router.get(
    "/:id",
    verifyToken,
    getTempReportById
);



module.exports = router;