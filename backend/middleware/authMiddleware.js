const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { getOrLoadAuthUser } = require("../utils/authUserCache");

function normalize(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
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

        if (!Number.isInteger(decodedUserId) || decodedUserId <= 0) {
            return res.status(401).json({
                code: "TOKEN_USER_INVALID",
                message: "Thông tin tài khoản trong token không hợp lệ"
            });
        }

        const currentUser = await getOrLoadAuthUser(
            decodedUserId,
            async () => {
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
                return rows[0] || null;
            }
        );

        if (!currentUser) {
            return res.status(401).json({
                code: "USER_NOT_FOUND",
                message: "Tài khoản không còn tồn tại"
            });
        }

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
                decodedUserId,
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
        if (
            error?.code === "ER_ACCESS_DENIED_ERROR" ||
            error?.code === "ECONNREFUSED"
        ) {
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
