const express = require("express");

const router = express.Router();


const {

    exportGiaCongExcel,

    exportGoogleSheet,

    createGoogleSheet,

    updateGoogleSheet

} = require("../controllers/reportExportController");




// =====================================
// EXPORT EXCEL
// GET /api/reports/export-excel
// =====================================

router.get(

    "/export-excel",

    exportGiaCongExcel

);




// =====================================
// GOOGLE SHEET
// =====================================


// tạo sheet mới

router.post(

    "/create-sheet",

    createGoogleSheet

);




// cập nhật sheet

router.post(

    "/update-sheet",

    updateGoogleSheet

);




// cập nhật dạng GET cũ (nếu FE còn dùng)

router.get(

    "/export-google-sheet",

    exportGoogleSheet

);



module.exports = router;