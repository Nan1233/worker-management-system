const express = require("express");

const router = express.Router();


const {
    exportGiaCongExcel
}
=
require("../controllers/reportExportController");



// EXPORT EXCEL
router.get(
    "/export-excel",
    exportGiaCongExcel
);



module.exports = router;