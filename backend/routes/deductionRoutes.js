const express = require("express");

const router = express.Router();

const deductionController = require("../controllers/deductionController");



router.get(

    "/processes/:id/deductions",

    deductionController.getDeductionsByProcess

);



module.exports = router;