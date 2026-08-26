const express = require("express");

const router = express.Router();


const {

    getAllReports,

    getReportDates,

    getReportsByDate,

    getReportById,

    updateReport,

    deleteReport,

    restoreReportVersion


} = require("../controllers/productionController");



const verifyToken =
    require("../middleware/authMiddleware");

const checkRole =
    require("../middleware/roleMiddleware");
const permission = require("../middleware/permissionMiddleware");
const { expensiveUserLimiter } = require("../middleware/rateLimiters");
const notifyWorkerOnApprovedEdit = require("../middleware/notifyWorkerOnApprovedEdit");

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
    expensiveUserLimiter,
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
// KHÔI PHỤC PHIÊN BẢN BÁO CÁO ĐÃ DUYỆT
// =====================================
router.post(
    "/:id/versions/:versionNo/restore",
    verifyToken,
    checkRole("admin", "manager"),
    permission("REPORT_APPROVED_EDIT"),
    restoreReportVersion
);


// =====================================
// UPDATE
// =====================================
// Manager/Admin đã được giới hạn bởi roleMiddleware ở đây và bởi
// assertProcessScope() + business validation trong updateApprovedReport().
// Không đặt permissionMiddleware ở route này nữa vì quyền sửa báo cáo đã duyệt
// là quyền nghiệp vụ bắt buộc của Manager; permission override không được phép
// biến một Manager đang phụ trách công đoạn thành trạng thái "được sửa UI nhưng
// luôn bị 403 khi lưu".
router.put(

    "/:id",

    verifyToken,

    checkRole("admin", "manager"),
    notifyWorkerOnApprovedEdit,

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
