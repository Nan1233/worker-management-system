const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");

const reportExportController = require(
    "../controllers/reportExportController"
);


// =====================================================
// XUẤT FILE EXCEL
//
// GET /api/reports/export-excel
//     ?date=2026-07-16
//     &type=pending
//
// type:
// - pending  : lấy bảng production_reports_temp
// - approved : lấy bảng production_reports
// =====================================================

router.get(
    "/export-excel",
    authMiddleware,
    checkRole("admin", "manager", "lead"),
    reportExportController.exportGiaCongExcel
);


// =====================================================
// ĐỒNG BỘ GOOGLE SHEET
//
// GET /api/reports/google-sheet?date=2026-07-16
// =====================================================

router.get(
    "/google-sheet",
    authMiddleware,
    checkRole("admin", "manager", "lead"),
    reportExportController.exportGoogleSheet
);


// =====================================================
// TẠO GOOGLE SHEET
//
// POST /api/reports/create-sheet
// Body:
// {
//     "date": "2026-07-16"
// }
// =====================================================

router.post(
    "/create-sheet",
    authMiddleware,
    checkRole("admin", "manager", "lead"),
    reportExportController.createGoogleSheet
);


// =====================================================
// CẬP NHẬT GOOGLE SHEET
//
// POST /api/reports/update-sheet
// Body:
// {
//     "date": "2026-07-16"
// }
// =====================================================

router.post(
    "/update-sheet",
    authMiddleware,
    checkRole("admin", "manager", "lead"),
    reportExportController.updateGoogleSheet
);


module.exports = router;