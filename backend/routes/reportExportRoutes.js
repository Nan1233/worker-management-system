const express = require("express");

const router = express.Router();


const {
    exportGiaCongExcel,
    exportGoogleSheet
} = require("../controllers/reportExportController");


// EXPORT EXCEL
// GET /api/reports/export-excel?date=2026-07-14&type=approved
router.get(
    "/export-excel",
    exportGiaCongExcel
);

router.get(
    "/export-google-sheet",
    exportGoogleSheet
);

module.exports = router;