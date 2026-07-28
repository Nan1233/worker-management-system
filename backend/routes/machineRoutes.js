const express =
    require("express");

const router =
    express.Router();

const machineController =
    require("../controllers/machineController");

const verifyToken =
    require("../middleware/fastAuthMiddleware");


router.get(
    "/",
    verifyToken,
    machineController.getMachines
);


module.exports =
    router;