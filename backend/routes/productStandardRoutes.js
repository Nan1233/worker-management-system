const express =
    require("express");

const router =
    express.Router();

const productStandardController =
    require("../controllers/productStandardController");

const verifyToken =
    require("../middleware/authMiddleware");


router.get(
    "/",
    verifyToken,
    productStandardController.getProductStandards
);


module.exports =
    router;