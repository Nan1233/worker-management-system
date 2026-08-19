const express = require("express");
const authMiddleware = require("../middleware/fastAuthMiddleware");

const router = express.Router();

// Connectivity is intentionally unrestricted for all authenticated users.
// Keep this compatibility endpoint for older clients, but never turn it into
// an authorization gate: workers may submit over any normal Internet link.
router.get("/access", authMiddleware, (req, res) => {
    return res.json({
        success: true,
        data: {
            allowed: true,
            restricted: false,
            enforced: false,
            configured: false,
            client_ip: req.ip || req.socket?.remoteAddress || null,
            message: "Tài khoản không bị giới hạn mạng."
        }
    });
});

module.exports = router;
