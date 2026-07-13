const express = require("express");

const router = express.Router();

const {
    getAllReports,
    getReportById,
    updateReport,
    deleteReport
} = require("../controllers/productionController");


const verifyToken = require("../middleware/authMiddleware");


// lấy dữ liệu chính
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