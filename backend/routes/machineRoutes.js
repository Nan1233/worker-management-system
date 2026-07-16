const express =
    require("express");

const router =
    express.Router();

const machineController =
    require("../controllers/machineController");

const verifyToken =
    require("../middleware/authMiddleware");


router.get(
    "/",
    verifyToken,
    machineController.getMachines
);


module.exports =
    router;