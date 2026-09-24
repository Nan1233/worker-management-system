const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const runPendingMigrations = require("../scripts/runPendingMigrations");
const {
    loginAccountLimiter,
    loginNetworkLimiter,
    refreshLimiter,
} = require("../middleware/rateLimiters");

async function ensureCloudflareTestMigrationsBeforeLogin(req, res, next) {
    const isCloudflareWorker = String(process.env.KTC_CLOUDFLARE_WORKER || "").toLowerCase() === "true";
    const migrationsEnabled = String(process.env.KTC_RUN_BUILD_DB_MIGRATIONS || "").toLowerCase() === "true";

    if (!isCloudflareWorker || !migrationsEnabled) return next();

    try {
        const complete = await runPendingMigrations();
        if (complete === false) {
            return res.status(503).json({
                success: false,
                code: "TEST_DB_MIGRATION_IN_PROGRESS",
                message: "Cơ sở dữ liệu test đang chạy migration. Vui lòng thử đăng nhập lại sau vài giây."
            });
        }
        return next();
    } catch (error) {
        console.error("[KTC][MIGRATION] login bootstrap failed", error?.message || String(error), error);
        return res.status(503).json({
            success: false,
            code: "TEST_DB_MIGRATION_FAILED",
            message: "Cơ sở dữ liệu test chưa sẵn sàng. Migration thất bại, vui lòng thử lại."
        });
    }
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

module.exports = router;
