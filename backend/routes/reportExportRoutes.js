const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");
const reportExportController = require("../controllers/reportExportController");
const validate = require("../middleware/validateRequest");

const allowedRoles = checkRole("admin", "manager", "lead");

// Tương thích frontend hiện tại.
router.post(
    "/export-excel",
    authMiddleware,
    allowedRoles,
    validate({ date: { required: true, type: "date" } }),
    reportExportController.exportGiaCongExcel
);

// API chuẩn dùng chung cho web/mobile/desktop.
router.get(
    "/export-excel",
    authMiddleware,
    allowedRoles,
    reportExportController.exportGiaCongExcel
);

router.get(
    "/export-excel/status",
    authMiddleware,
    allowedRoles,
    reportExportController.getMonthlyExcelStatus
);

module.exports = router;
