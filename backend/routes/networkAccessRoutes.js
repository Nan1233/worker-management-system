const express = require("express");
const authMiddleware = require("../middleware/fastAuthMiddleware");
const { evaluateCompanyNetwork } = require("../middleware/companyNetworkMiddleware");

const router = express.Router();

router.get("/access", authMiddleware, (req, res) => {
    const role = String(req.user?.role || "").toLowerCase();
    const access = evaluateCompanyNetwork(req);
    const restricted = role === "worker" && access.enforced;
    const allowed = role !== "worker" || access.allowed;

    return res.json({
        success: true,
        data: {
            allowed,
            restricted,
            enforced: access.enforced,
            configured: access.configured,
            client_ip: access.clientIp,
            message: allowed
                ? restricted
                    ? "Thiết bị đang kết nối qua mạng công ty."
                    : "Tài khoản không bị giới hạn mạng."
                : access.configured
                    ? "Vui lòng kết nối với mạng KTC để nhập báo cáo."
                    : "Hệ thống chưa cấu hình địa chỉ mạng công ty."
        }
    });
});

module.exports = router;
