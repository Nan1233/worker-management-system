const express = require("express");

const router = express.Router();


const {

    createTempReport,

    getTempReports,

    getTempReportById

} = require("../controllers/productionTempController");


const verifyToken = require("../middleware/authMiddleware");



// Worker tạo báo cáo tạm

router.post(
    "/",
    verifyToken,
    createTempReport
);



// Manager xem danh sách báo cáo chờ duyệt

router.get(
    "/",
    verifyToken,
    getTempReports
);



// Xem chi tiết báo cáo tạm

router.get(
    "/:id",
    verifyToken,
    getTempReportById
);



module.exports = router;