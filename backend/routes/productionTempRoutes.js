const express = require("express");

const router = express.Router();


const {

    createTempReport,

    getTempDates,

    getTempReportsByDate,

    approveTempByDate,

    getTempReportById,

    getMyTempReports


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






module.exports = router;