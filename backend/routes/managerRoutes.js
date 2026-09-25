const express = require("express");

const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");
const permission = require("../middleware/permissionMiddleware");

const managerController = require("../controllers/managerController");

router.get(
    "/reports",
    verifyToken,
    checkRole("admin", "manager", "lead"),
    permission("REPORT_PENDING_VIEW"),
    managerController.getTempReports
);

module.exports = router;
