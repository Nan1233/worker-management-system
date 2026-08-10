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
const permission = require("../middleware/permissionMiddleware");

const { syncExcelEdits } = require("../controllers/excelEditSyncController");





// =====================================
// LẤY DANH SÁCH NGÀY BÁO CÁO ĐÃ DUYỆT
// =====================================

router.get(

    "/dates",

    verifyToken,

    checkRole("admin", "manager", "lead"),
    permission("REPORT_APPROVED_VIEW"),

    getReportDates

);







// =====================================
// LỌC BÁO CÁO ĐÃ DUYỆT THEO NGÀY
// =====================================

router.get(

    "/by-date",

    verifyToken,

    checkRole("admin", "manager", "lead"),
    permission("REPORT_APPROVED_VIEW"),

    getReportsByDate

);







// =====================================
// LẤY TẤT CẢ BÁO CÁO
// =====================================

router.get(

    "/",

    verifyToken,

    checkRole("admin", "manager", "lead"),
    permission("REPORT_APPROVED_VIEW"),

    getAllReports

);







// =====================================
// ĐỒNG BỘ CHỈNH SỬA TỪ EXCEL DESKTOP
// =====================================
router.post(
    "/excel-sync",
    verifyToken,
    checkRole("admin", "manager"),
    permission("EXCEL_DB_SYNC"),
    syncExcelEdits
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
    permission("REPORT_APPROVED_EDIT"),

    updateReport

);







// =====================================
// DELETE
// =====================================

router.delete(

    "/:id",

    verifyToken,

    checkRole("admin", "manager"),
    permission("REPORT_DELETE"),

    deleteReport

);





module.exports = router;