const express = require("express");
const router = express.Router();


const workerController = require("../controllers/workerController");

const verifyToken = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");



router.get(
    "/",
    verifyToken,
    checkRole("admin","manager"),
    workerController.getAllWorkers
);



router.post(
    "/",
    verifyToken,
    checkRole("admin","manager"),
    workerController.createWorker
);



module.exports = router;