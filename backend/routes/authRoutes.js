const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const {
    loginAccountLimiter,
    loginNetworkLimiter,
    refreshLimiter,
} = require("../middleware/rateLimiters");

// Login uses two bounded buckets: account identity prevents IP rotation bypass;
// a much larger trusted-network bucket limits broad brute force without making
// carrier/office NAT the primary identity for legitimate users.
router.post("/login", loginNetworkLimiter, loginAccountLimiter, authController.login);
router.post("/refresh", refreshLimiter, authController.refresh);
router.post("/logout", authController.logout);

module.exports = router;
