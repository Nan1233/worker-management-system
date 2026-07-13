const express = require("express");

const router = express.Router();


const {

    getAllReports,

    getReportDates,

    getReportsByDate,

    getReportById,

    updateReport,

    deleteReport


} = require("../controllers/productionController");



const verifyToken =
    require("../middleware/authMiddleware");





// =====================================
// LẤY DANH SÁCH NGÀY BÁO CÁO ĐÃ DUYỆT
// =====================================

router.get(

    "/dates",

    verifyToken,

    getReportDates

);







// =====================================
// LỌC BÁO CÁO ĐÃ DUYỆT THEO NGÀY
// =====================================

router.get(

    "/by-date",

    verifyToken,

    getReportsByDate

);







// =====================================
// LẤY TẤT CẢ BÁO CÁO
// =====================================

router.get(

    "/",

    verifyToken,

    getAllReports

);







// =====================================
// CHI TIẾT BÁO CÁO
// =====================================

router.get(

    "/:id",

    verifyToken,

    getReportById

);







// =====================================
// UPDATE
// =====================================

router.put(

    "/:id",

    verifyToken,

    updateReport

);







// =====================================
// DELETE
// =====================================

router.delete(

    "/:id",

    verifyToken,

    deleteReport

);





module.exports = router;