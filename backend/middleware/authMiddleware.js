const jwt = require("jsonwebtoken");
const db = require("../config/db");
const {
    getOrLoadAuthUser,
    setCachedAuthUser
} = require("../utils/authUserCache");

function normalize(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
}

function isDatabaseUnavailable(error) {
    return [
        "ER_ACCESS_DENIED_ERROR",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "PROTOCOL_CONNECTION_LOST",
        "ECONNRESET"
    ].includes(error?.code);
}

async function loadCurrentUser(decoded) {
    const decodedUserId = Number(decoded?.id);
    const decodedWorkerId = Number(decoded?.worker_id);
    const decodedUsername = String(decoded?.username || "").trim();

    // Token mới: id là users.id. Đây luôn là truy vấn ưu tiên.
    if (Number.isInteger(decodedUserId) && decodedUserId > 0) {
        const [rows] = await db.promise().query(
            `SELECT
                u.id,
                u.username,
                u.role,
                u.status,
                w.id AS worker_id,
                w.status AS worker_status,
                DATABASE() AS database_name
             FROM users u
             LEFT JOIN workers w ON w.user_id = u.id
             WHERE u.id = ?
             LIMIT 1`,
            [decodedUserId]
        );

        if (rows[0]) return rows[0];
    }

    // Tương thích token cũ: một số bản trước từng đặt workers.id vào id.
    // Chỉ dùng các giá trị đã được ký trong JWT để tìm lại users.id thật.
    const fallbackConditions = [];
    const fallbackParams = [];

    if (decodedUsername) {
        fallbackConditions.push("TRIM(u.username) = ?");
        fallbackParams.push(decodedUsername);
    }

    if (Number.isInteger(decodedWorkerId) && decodedWorkerId > 0) {
        fallbackConditions.push("w.id = ?");
        fallbackParams.push(decodedWorkerId);
    }

    if (Number.isInteger(decodedUserId) && decodedUserId > 0) {
        fallbackConditions.push("w.id = ?");
        fallbackParams.push(decodedUserId);
    }

    if (!fallbackConditions.length) return null;

    const [fallbackRows] = await db.promise().query(
        `SELECT
            u.id,
            u.username,
            u.role,
            u.status,
            w.id AS worker_id,
            w.status AS worker_status,
            DATABASE() AS database_name
         FROM users u
         LEFT JOIN workers w ON w.user_id = u.id
         WHERE ${fallbackConditions.join(" OR ")}
         ORDER BY
            CASE WHEN TRIM(u.username) = ? THEN 0 ELSE 1 END,
            u.id
         LIMIT 1`,
        [...fallbackParams, decodedUsername]
    );

    return fallbackRows[0] || null;
}

module.exports = async (req, res, next) => {
    const authorization = String(req.headers.authorization || "");
    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({
            code: "TOKEN_MISSING",
            message: "Không có token"
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const decodedUserId = Number(decoded?.id);
        const decodedWorkerId = Number(decoded?.worker_id);
        const decodedUsername = String(decoded?.username || "").trim();

        if (
            (!Number.isInteger(decodedUserId) || decodedUserId <= 0) &&
            (!Number.isInteger(decodedWorkerId) || decodedWorkerId <= 0) &&
            !decodedUsername
        ) {
            return res.status(401).json({
                code: "TOKEN_USER_INVALID",
                message: "Thông tin tài khoản trong token không hợp lệ"
            });
        }

        const cacheKey =
            Number.isInteger(decodedUserId) && decodedUserId > 0
                ? decodedUserId
                : Number.isInteger(decodedWorkerId) && decodedWorkerId > 0
                    ? decodedWorkerId
                    : decodedUsername;

        const currentUser = await getOrLoadAuthUser(
            cacheKey,
            () => loadCurrentUser(decoded)
        );

        if (!currentUser) {
            console.warn("AUTH_TOKEN_USER_NOT_RESOLVED", {
                path: req.originalUrl,
                decodedUserId: decoded?.id ?? null,
                decodedWorkerId: decoded?.worker_id ?? null,
                decodedUsername: decodedUsername || null
            });

            return res.status(401).json({
                code: "TOKEN_USER_NOT_FOUND",
                message: "Phiên đăng nhập cần được làm mới"
            });
        }

        // Làm nóng cache bằng users.id thật để token mới dùng ngay sau refresh.
        setCachedAuthUser(currentUser);

        const role = normalize(currentUser.role);
        const userStatus = normalize(currentUser.status);
        const workerStatus = normalize(currentUser.worker_status);

        const userInactive = userStatus !== "active";
        const workerInactive =
            role === "worker" &&
            (!currentUser.worker_id || workerStatus !== "active");

        if (userInactive || workerInactive) {
            console.error("AUTH_FORBIDDEN", {
                path: req.originalUrl,
                database: currentUser.database_name,
                decodedUserId: decoded?.id ?? null,
                userId: currentUser.id,
                username: currentUser.username,
                roleRaw: currentUser.role,
                role,
                userStatusRaw: currentUser.status,
                userStatus,
                workerId: currentUser.worker_id,
                workerStatusRaw: currentUser.worker_status,
                workerStatus
            });

            return res.status(403).json({
                code: userInactive ? "USER_INACTIVE" : "WORKER_INACTIVE",
                message: "Tài khoản đã bị khóa. Vui lòng liên hệ quản lý"
            });
        }

        req.user = {
            ...decoded,
            id: Number(currentUser.id),
            username: currentUser.username,
            role,
            worker_id: currentUser.worker_id
                ? Number(currentUser.worker_id)
                : null
        };

        return next();
    } catch (error) {
        if (isDatabaseUnavailable(error)) {
            console.error("Không thể kiểm tra trạng thái tài khoản:", error);

            return res.status(503).json({
                code: "AUTH_DATABASE_UNAVAILABLE",
                message: "Không thể xác thực tài khoản lúc này"
            });
        }

        console.error("AUTH_TOKEN_ERROR", {
            name: error?.name,
            message: error?.message
        });

        return res.status(401).json({
            code: error?.name === "TokenExpiredError"
                ? "TOKEN_EXPIRED"
                : "TOKEN_INVALID",
            message: error?.name === "TokenExpiredError"
                ? "Phiên đăng nhập đã hết hạn"
                : "Token không hợp lệ"
        });
    }
};
