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



const verifyToken =
require("../middleware/authMiddleware");





// worker gửi

router.post(
    "/",
    verifyToken,
    createTempReport
);



// worker lịch sử

router.get(
"/my",
authMiddleware,
productionTempController.getMyTempReports
);




// manager pending

router.get(
    "/pending",
    verifyToken,
    getPendingReports
);




// manager approved

router.get(
    "/approved",
    verifyToken,
    getApprovedReports
);




// danh sách ngày

router.get(
    "/dates",
    verifyToken,
    getTempDates
);




// xem theo ngày

router.get(
    "/by-date",
    verifyToken,
    getTempReportsByDate
);




// duyệt theo ngày

router.post(
    "/approve-date",
    verifyToken,
    approveTempByDate
);




// chi tiết để cuối

router.get(
    "/:id",
    verifyToken,
    getTempReportDetail
);



module.exports = router;
const express = require("express");

const router = express.Router();


const productionTempController =
require("../controllers/productionTempController");


const authMiddleware =
require("../middleware/authMiddleware");