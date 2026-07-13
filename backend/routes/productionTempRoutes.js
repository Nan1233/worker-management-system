const express = require("express");

const router = express.Router();




// ======================================
// WORKER GỬI BÁO CÁO
// ======================================

router.post(

    "/",

    verifyToken,

    createTempReport

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
// VD:
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
// XEM CHI TIẾT ĐỂ SỬA
// ĐẶT CUỐI CÙNG
// ======================================

router.get(

    "/:id",

    verifyToken,

    getTempReportById

);




const {

    createTempReport,

    getTempDates,

    getTempReportsByDate,

    approveTempByDate,

    getTempReportById,

    getMyTempReports,

    getPendingReports,      // thêm
    getApprovedReports      // thêm

} = require("../controllers/productionTempController");
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
module.exports = router;