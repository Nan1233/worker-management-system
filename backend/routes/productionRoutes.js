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

const checkRole =
    require("../middleware/roleMiddleware");





// =====================================
// LẤY DANH SÁCH NGÀY BÁO CÁO ĐÃ DUYỆT
// =====================================

router.get(

    "/dates",

    verifyToken,

    checkRole("admin", "manager", "lead"),

    getReportDates

);







// =====================================
// LỌC BÁO CÁO ĐÃ DUYỆT THEO NGÀY
// =====================================

router.get(

    "/by-date",

    verifyToken,

    checkRole("admin", "manager", "lead"),

    getReportsByDate

);







// =====================================
// LẤY TẤT CẢ BÁO CÁO
// =====================================

router.get(

    "/",

    verifyToken,

    checkRole("admin", "manager", "lead"),

    getAllReports

);







// =====================================
// CHI TIẾT BÁO CÁO
// =====================================

router.get(

    "/:id",

    verifyToken,

    checkRole("admin", "manager", "lead", "worker"),

    getReportById

);







// =====================================
// UPDATE
// =====================================

router.put(

    "/:id",

    verifyToken,

    checkRole("admin", "manager"),

    updateReport

);







// =====================================
// DELETE
// =====================================

router.delete(

    "/:id",

    verifyToken,

    checkRole("admin", "manager"),

    deleteReport

);





module.exports = router;