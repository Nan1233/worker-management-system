const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const authController = require("../controllers/authController");

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau."
    }
});

router.post("/login", loginLimiter, authController.login);

module.exports = router;