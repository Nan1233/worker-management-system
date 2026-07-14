const express = require("express");
const router = express.Router();


const workerController = require("../controllers/workerController");

const verifyToken = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");




// ADMIN / MANAGER xem tất cả worker

router.get(
    "/",
    verifyToken,
    checkRole("admin","manager"),
    workerController.getAllWorkers
);




// ADMIN / MANAGER tạo worker

router.post(
    "/",
    verifyToken,
    checkRole("admin","manager"),
    workerController.createWorker
);




// USER lấy thông tin worker của chính mình

router.get(
    "/:id",
    verifyToken,
    workerController.getWorkerById
);



module.exports = router;