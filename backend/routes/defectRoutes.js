const express = require("express");

const router = express.Router();

const defectController = require("../controllers/defectController");



router.get(

    "/processes/:id/defects",

    defectController.getDefectsByProcess

);



module.exports = router;