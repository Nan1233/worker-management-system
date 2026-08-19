const express = require("express");

const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");

const deductionController = require("../controllers/deductionController");



router.get(

    "/processes/:id/deductions",

    verifyToken,

    deductionController.getDeductionsByProcess

);



module.exports = router;