const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const runPendingMigrations = require("../scripts/runPendingMigrations");
const {
    loginAccountLimiter,
    loginNetworkLimiter,
    refreshLimiter,
    passwordChangeLimiter,
} = require("../middleware/rateLimiters");
const authMiddleware = require("../middleware/authMiddleware");

// Never run schema migrations inside an interactive login request.
// TiDB DDL/network latency can exceed the Cloudflare request lifetime and leave
// every login Pending until the Worker cancels it. Apply migrations through the
// reviewed deployment/migration workflow, and use /api/health/ready to diagnose
// schema/database readiness instead.
function ensureCloudflareTestMigrationsBeforeLogin(_req, _res, next) {
    return next();
}

// Login uses two bounded buckets: account identity prevents IP rotation bypass;
// a much larger trusted-network bucket limits broad brute force without making
// carrier/office NAT the primary identity for legitimate users.
router.post(
    "/login",
    ensureCloudflareTestMigrationsBeforeLogin,
    loginNetworkLimiter,
    loginAccountLimiter,
    authController.login
);
router.post("/refresh", refreshLimiter, authController.refresh);
router.post("/logout", authController.logout);
router.put("/password", authMiddleware, passwordChangeLimiter, authController.changePassword);

module.exports = router;
