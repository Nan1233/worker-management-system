// IP Internet công cộng được phép gửi/sửa báo cáo công nhân.
// Render chạy phía sau reverse proxy, vì vậy phải đọc chuỗi X-Forwarded-For
// và chọn IP public đầu tiên thay vì lấy IP nội bộ 10.x của proxy.
const DEFAULT_COMPANY_NETWORKS = ["113.160.133.126"];

function normalizeIp(rawValue) {
    let value = String(rawValue || "").trim();
    if (!value) return "";

    // Xóa dấu ngoặc của IPv6 và tiền tố IPv4-mapped IPv6.
    value = value.replace(/^\[|\]$/g, "");
    if (value.startsWith("::ffff:")) value = value.slice(7);

    // Bỏ zone id của IPv6, ví dụ fe80::1%eth0.
    value = value.split("%")[0];

    // Bỏ port nếu proxy gửi IPv4:port.
    const ipv4WithPort = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4WithPort) value = ipv4WithPort[1];

    return value;
}

function isPrivateOrProxyIp(rawIp) {
    const ip = normalizeIp(rawIp);
    if (!ip) return true;

    if (ip === "::1" || ip === "127.0.0.1") return true;
    if (ip.startsWith("10.")) return true;
    if (ip.startsWith("192.168.")) return true;

    const match172 = ip.match(/^172\.(\d{1,3})\./);
    if (match172) {
        const second = Number(match172[1]);
        if (second >= 16 && second <= 31) return true;
    }

    // Link-local / carrier-grade NAT / unspecified.
    if (ip.startsWith("169.254.")) return true;
    if (ip.startsWith("100.64.")) return true;
    if (ip === "0.0.0.0") return true;

    return false;
}

function parseForwardedFor(value) {
    const raw = Array.isArray(value) ? value.join(",") : String(value || "");
    return raw
        .split(",")
        .map(normalizeIp)
        .filter(Boolean);
}

function getClientIp(req) {
    // Render/Cloudflare có thể cung cấp header chuyên dụng.
    const directCandidates = [
        req.headers["cf-connecting-ip"],
        req.headers["true-client-ip"],
        req.headers["x-client-ip"]
    ];

    for (const candidate of directCandidates) {
        const ip = normalizeIp(candidate);
        if (ip && !isPrivateOrProxyIp(ip)) return ip;
    }

    // X-Forwarded-For thường có dạng: client, proxy-1, proxy-2.
    // Chọn IP public đầu tiên; bỏ các IP 10.x nội bộ của Render.
    const forwardedChain = parseForwardedFor(req.headers["x-forwarded-for"]);
    const firstPublicIp = forwardedChain.find((ip) => !isPrivateOrProxyIp(ip));
    if (firstPublicIp) return firstPublicIp;

    // Express đã bật trust proxy; dùng req.ips/req.ip làm phương án dự phòng.
    const expressChain = Array.isArray(req.ips) ? req.ips.map(normalizeIp) : [];
    const expressPublicIp = expressChain.find((ip) => !isPrivateOrProxyIp(ip));
    if (expressPublicIp) return expressPublicIp;

    const requestIp = normalizeIp(req.ip);
    if (requestIp && !isPrivateOrProxyIp(requestIp)) return requestIp;

    const realIp = normalizeIp(req.headers["x-real-ip"]);
    if (realIp && !isPrivateOrProxyIp(realIp)) return realIp;

    return normalizeIp(req.socket?.remoteAddress || requestIp || forwardedChain[0] || "");
}

function getAllowedNetworks() {
    const configured = String(process.env.COMPANY_ALLOWED_IPS || "")
        .split(",")
        .map(normalizeIp)
        .filter(Boolean);

    return configured.length ? configured : DEFAULT_COMPANY_NETWORKS;
}

function matchesNetwork(clientIp, rule) {
    const client = normalizeIp(clientIp);
    const allowed = normalizeIp(rule);
    return Boolean(client && allowed && !allowed.includes("/") && client === allowed);
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
        cfConnectingIp: req.headers["cf-connecting-ip"] || "",
        xRealIp: req.headers["x-real-ip"] || "",
        expressIp: req.ip || "",
        expressIps: req.ips || [],
        remoteAddress: req.socket?.remoteAddress || "",
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
    isPrivateOrProxyIp,
    parseForwardedFor,
    requireCompanyNetworkForWorker
};
