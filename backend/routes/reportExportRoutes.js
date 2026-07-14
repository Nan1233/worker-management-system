const express = require("express");

const router = express.Router();


const {
    exportGiaCongExcel
} = require("../controllers/reportExportController");



// EXPORT EXCEL
// GET /api/reports/export-excel?date=2026-07-14&type=approved
router.get(
    "/export-excel",
    exportGiaCongExcel
);



module.exports = router;