const express = require("express");

const router = express.Router();

const {
    createReport,
    getAllReports,
    getReportById,
    updateReport,
    deleteReport
} = require("../controllers/productionController");


const verifyToken = require("../middleware/authMiddleware");


// tạo báo cáo
router.post(
    "/",
    verifyToken,
    createReport
);


// lấy tất cả báo cáo
router.get(
    "/",
    verifyToken,
    getAllReports
);


router.get(
    "/:id",
    verifyToken,
    getReportById
);


router.put(
    "/:id",
    verifyToken,
    updateReport
);


router.delete(
    "/:id",
    verifyToken,
    deleteReport
);


module.exports = router;