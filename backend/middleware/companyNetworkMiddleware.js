const ipaddr = require("ipaddr.js");

function normalizeIp(rawValue) {
    let value = String(rawValue || "").trim();
    if (!value) return "";

    // x-forwarded-for có thể chứa nhiều IP; IP đầu tiên là client gốc.
    if (value.includes(",")) value = value.split(",")[0].trim();
    if (value.startsWith("::ffff:")) value = value.slice(7);

    // IPv6 có thể kèm zone id, ví dụ fe80::1%lo0.
    value = value.split("%")[0];
    return value;
}

function getClientIp(req) {
    return normalizeIp(
        req.headers["cf-connecting-ip"] ||
        req.headers["x-real-ip"] ||
        req.headers["x-forwarded-for"] ||
        req.ip ||
        req.socket?.remoteAddress ||
        ""
    );
}

function isTruthy(value) {
    return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function getAllowedNetworks() {
    return String(process.env.COMPANY_ALLOWED_IPS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

function matchesNetwork(clientIp, rule) {
    try {
        const address = ipaddr.parse(clientIp);

        if (rule.includes("/")) {
            const [range, prefixLength] = ipaddr.parseCIDR(rule);
            return address.kind() === range.kind() && address.match(range, prefixLength);
        }

        const allowedAddress = ipaddr.parse(normalizeIp(rule));
        return address.kind() === allowedAddress.kind() && address.toString() === allowedAddress.toString();
    } catch (_error) {
        return false;
    }
}

function evaluateCompanyNetwork(req) {
    const clientIp = getClientIp(req);
    const enforced = isTruthy(process.env.COMPANY_NETWORK_ENFORCED);
    const allowedNetworks = getAllowedNetworks();
    const configured = allowedNetworks.length > 0;
    const allowed = !enforced || (configured && allowedNetworks.some((rule) => matchesNetwork(clientIp, rule)));

    return {
        allowed,
        enforced,
        configured,
        clientIp
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
        configured: access.configured,
        path: req.originalUrl
    }));

    return res.status(403).json({
        success: false,
        code: access.configured
            ? "COMPANY_NETWORK_REQUIRED"
            : "COMPANY_NETWORK_NOT_CONFIGURED",
        message: access.configured
            ? "Bạn chỉ có thể nhập báo cáo khi kết nối với mạng của KTC (HANOI) CO., LTD."
            : "Hệ thống chưa cấu hình địa chỉ mạng công ty. Vui lòng liên hệ quản trị viên.",
        network: {
            allowed: false,
            enforced: access.enforced,
            configured: access.configured,
            client_ip: access.clientIp
        }
    });
}

module.exports = {
    evaluateCompanyNetwork,
    getClientIp,
    requireCompanyNetworkForWorker
};
