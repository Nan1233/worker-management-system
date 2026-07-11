const express = require("express");

const router = express.Router();

const {

    createReport,

    getAllReports,

    getReportById,

    updateReport,

    deleteReport

} = require("../controllers/productionController");


router.post("/", createReport);

router.get("/", getAllReports);
router.get("/:id", getReportById);
router.put("/:id", updateReport);

router.delete("/:id", deleteReport);
module.exports = router;