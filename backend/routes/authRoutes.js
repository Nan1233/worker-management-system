const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const authController = require("../controllers/authController");

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        success: false,
        message:
            "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau."
    }
});

const refreshLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        success: false,
        message:
            "Yêu cầu làm mới phiên quá nhiều. Vui lòng thử lại sau."
    }
});

router.post(
    "/login",
    loginLimiter,
    authController.login
);

router.post(
    "/refresh",
    refreshLimiter,
    authController.refresh
);

router.post(
    "/logout",
    authController.logout
);

module.exports = router;