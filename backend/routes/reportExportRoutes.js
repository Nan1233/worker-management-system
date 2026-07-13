const express = require("express");

const router = express.Router();


const {
    exportGiaCongExcel
}
=
require("../controllers/reportExportController");



router.post(
    "/export-excel",
    exportGiaCongExcel
);



module.exports = router;