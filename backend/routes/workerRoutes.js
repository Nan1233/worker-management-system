const express = require("express");
const router = express.Router();


const workerController = require("../controllers/workerController");

const verifyToken = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");




// ADMIN MANAGER

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




// WORKER

router.get(
    "/:id",
    verifyToken,
    workerController.getWorkerById
);




router.put(
    "/:id",
    verifyToken,
    checkRole("admin","manager"),
    workerController.updateWorker
);



module.exports = router;