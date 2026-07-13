const express = require("express");

const router = express.Router();


const {
    exportProductionExcel
}
=
require("../controllers/reportExportController");



router.get(
    "/export-excel",
    exportProductionExcel
);



module.exports = router;