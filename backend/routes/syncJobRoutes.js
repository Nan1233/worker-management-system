const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");
const permission = require("../middleware/permissionMiddleware");
const controller = require("../controllers/syncJobController");

router.post("/process", controller.process);
router.get("/health", authMiddleware, checkRole("admin", "manager"), permission("SYSTEM_HEALTH_VIEW"), controller.health);
router.get("/", authMiddleware, checkRole("admin", "manager"), permission("SYSTEM_HEALTH_VIEW"), controller.list);
module.exports = router;
