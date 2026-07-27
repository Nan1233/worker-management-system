// IP Internet công cộng duy nhất được phép gửi/sửa báo cáo công nhân.
// Có thể ghi đè bằng COMPANY_ALLOWED_IPS khi công ty bổ sung đường truyền,
// nhưng không thể tắt kiểm tra mạng trong môi trường production.
const DEFAULT_COMPANY_NETWORKS = ["113.160.133.126"];

function normalizeIp(rawValue) {
    let value = String(rawValue || "").trim();
    if (!value) return "";
    if (value.includes(",")) value = value.split(",")[0].trim();
    if (value.startsWith("::ffff:")) value = value.slice(7);
    value = value.split("%")[0];
    return value;
}

function getClientIp(req) {
    // server.js đã cấu hình app.set("trust proxy", 1), vì vậy req.ip là
    // địa chỉ client do Express xác định qua proxy Render. Không ưu tiên
    // x-real-ip vì header này có thể là IP proxy trung gian.
    const expressIp = normalizeIp(req.ip);
    if (expressIp) return expressIp;

    const forwarded = normalizeIp(req.headers["x-forwarded-for"]);
    if (forwarded) return forwarded;

    return normalizeIp(
        req.headers["cf-connecting-ip"] ||
        req.headers["x-real-ip"] ||
        req.socket?.remoteAddress ||
        ""
    );
}

function getAllowedNetworks() {
    const configured = String(process.env.COMPANY_ALLOWED_IPS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

    return configured.length ? configured : DEFAULT_COMPANY_NETWORKS;
}

function matchesNetwork(clientIp, rule) {
    const client = normalizeIp(clientIp);
    const allowed = normalizeIp(rule);

    // Hệ thống hiện khóa theo đúng IP public của KTC.
    // Không chấp nhận CIDR mơ hồ để tránh mở rộng ngoài ý muốn.
    if (!client || !allowed || allowed.includes("/")) return false;
    return client === allowed;
}

function isLocalDevelopmentRequest(req, clientIp) {
    if (process.env.NODE_ENV === "production") return false;
    if (!["127.0.0.1", "::1"].includes(clientIp)) return false;
    return ["localhost", "127.0.0.1"].includes(String(req.hostname || "").toLowerCase());
}

function evaluateCompanyNetwork(req) {
    const clientIp = getClientIp(req);
    const allowedNetworks = getAllowedNetworks();
    const localDevelopment = isLocalDevelopmentRequest(req, clientIp);
    const allowed = localDevelopment || allowedNetworks.some((rule) => matchesNetwork(clientIp, rule));

    return {
        allowed,
        enforced: true,
        configured: true,
        clientIp,
        allowedNetworks
    };
}

function requireCompanyNetworkForWorker(req, res, next) {
    if (String(req.user?.role || "").toLowerCase() !== "worker") {
        return next();
    }

    const access = evaluateCompanyNetwork(req);
    if (access.allowed) {
        req.companyNetwork = access;
        return next();
    }

    console.warn(JSON.stringify({
        type: "company_network_denied",
        requestId: req.requestId,
        userId: req.user?.id,
        workerId: req.user?.worker_id,
        clientIp: access.clientIp,
        allowedNetworks: access.allowedNetworks,
        xForwardedFor: req.headers["x-forwarded-for"] || "",
        xRealIp: req.headers["x-real-ip"] || "",
        expressIp: req.ip || "",
        path: req.originalUrl
    }));

    return res.status(403).json({
        success: false,
        code: "COMPANY_WIFI_REQUIRED",
        message: "Không thể gửi dữ liệu. Vui lòng tắt 4G/5G và kết nối Wi-Fi của KTC (HANOI) CO., LTD.",
        network: {
            allowed: false,
            enforced: true,
            configured: true,
            client_ip: access.clientIp
        }
    });
}

module.exports = {
    DEFAULT_COMPANY_NETWORKS,
    evaluateCompanyNetwork,
    getClientIp,
    requireCompanyNetworkForWorker
};
