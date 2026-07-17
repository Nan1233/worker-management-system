const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");
const controller = require("../controllers/productionTempController");

router.post("/", authMiddleware, checkRole("worker"), controller.createTempReport);
router.get("/my", authMiddleware, checkRole("worker"), controller.getMyTempReports);
router.get("/pending", authMiddleware, checkRole("admin", "manager", "lead"), controller.getPendingReports);
router.get("/approved", authMiddleware, checkRole("admin", "manager", "lead"), controller.getApprovedReports);
router.get("/dates", authMiddleware, checkRole("admin", "manager", "lead"), controller.getTempDates);
router.get("/by-date", authMiddleware, checkRole("admin", "manager", "lead"), controller.getTempReportsByDate);
router.post("/approve", authMiddleware, checkRole("admin", "manager", "lead"), controller.approveSelectedReports);
router.post("/reject", authMiddleware, checkRole("admin", "manager", "lead"), controller.rejectSelectedReports);
router.get("/:id/logs", authMiddleware, controller.getReportActionLogs);
router.put("/:id", authMiddleware, checkRole("admin", "manager"), controller.updateTempReport);
router.get("/:id", authMiddleware, controller.getTempReportDetail);

module.exports = router;
