const express = require("express");

const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");

const defectController = require("../controllers/defectController");



router.get(

    "/processes/:id/defects",

    verifyToken,

    defectController.getDefectsByProcess

);



module.exports = router;