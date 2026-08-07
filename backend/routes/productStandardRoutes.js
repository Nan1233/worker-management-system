const express =
    require("express");

const router =
    express.Router();

const productStandardController =
    require("../controllers/productStandardController");

const verifyToken =
    require("../middleware/fastAuthMiddleware");


router.get(
    "/resolve",
    verifyToken,
    productStandardController.resolveProductStandard
);

router.get(
    "/",
    verifyToken,
    productStandardController.getProductStandards
);


module.exports =
    router;