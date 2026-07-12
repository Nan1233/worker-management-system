const express = require("express");

const router = express.Router();


const {

    createTempReport,

    getTempReports,

    getTempReportById


} = require("../controllers/productionTempController");



router.post(
    "/",
    createTempReport
);



router.get(
    "/",
    getTempReports
);



router.get(
    "/:id",
    getTempReportById
);



module.exports = router;