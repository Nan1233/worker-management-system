const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const {
    loginAccountLimiter,
    loginNetworkLimiter,
    refreshLimiter,
    passwordChangeLimiter,
} = require("../middleware/rateLimiters");
const authMiddleware = require("../middleware/authMiddleware");

// Login uses two bounded buckets: account identity prevents IP rotation bypass;
// a much larger trusted-network bucket limits broad brute force without making
// carrier/office NAT the primary identity for legitimate users.
router.post(
    "/login",
    loginNetworkLimiter,
    loginAccountLimiter,
    authController.login
);
router.post("/refresh", refreshLimiter, authController.refresh);
router.post("/logout", authController.logout);
router.put("/password", authMiddleware, passwordChangeLimiter, authController.changePassword);

module.exports = router;
