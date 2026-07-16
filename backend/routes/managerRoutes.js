const express = require("express");

const router = express.Router();


const verifyToken = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");

const managerController = require("../controllers/managerController");



router.get(
    "/reports",
    verifyToken,
    checkRole("admin", "manager", "lead"),
    managerController.getTempReports
);



module.exports = router;