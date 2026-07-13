const express = require("express");

const router = express.Router();


const {

    createTempReport,

    getTempReports,

    getTempReportById,

    getMyTempReports

} = require("../controllers/productionTempController");


const verifyToken = require("../middleware/authMiddleware");





// =======================
// WORKER TẠO BÁO CÁO CHỜ DUYỆT
// =======================

router.post(
    "/",
    verifyToken,
    createTempReport
);






// =======================
// MANAGER XEM TẤT CẢ BÁO CÁO CHỜ DUYỆT
// =======================

router.get(
    "/",
    verifyToken,
    getTempReports
);







// =======================
// WORKER XEM BÁO CÁO CỦA MÌNH
// =======================

router.get(
    "/my",
    verifyToken,
    getMyTempReports
);







// =======================
// CHI TIẾT BÁO CÁO CHỜ DUYỆT
// =======================

router.get(
    "/:id",
    verifyToken,
    getTempReportById
);




module.exports = router;