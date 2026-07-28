const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const userModel = require("../models/userModel");
const sessionModel = require("../models/sessionModel");
const auditService = require("../services/auditService");
const { setCachedAuthUser } = require("../utils/authUserCache");

const ACCESS_TOKEN_EXPIRES_IN =
    process.env.ACCESS_TOKEN_EXPIRES_IN || "7d";

const PERMANENT_SESSION_EXPIRES_AT = "2099-12-31 23:59:59";

function findUserByUsername(username) {
    return new Promise((resolve, reject) => {
        userModel.findByUsername(username, (error, results) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(results || []);
        });
    });
}

function createSession(sessionData) {
    return new Promise((resolve, reject) => {
        sessionModel.createSession(sessionData, (error, result) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(result);
        });
    });
}

function findSessionByRefreshToken(refreshToken) {
    return new Promise((resolve, reject) => {
        sessionModel.findByRefreshToken(
            refreshToken,
            (error, results) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(results || []);
            }
        );
    });
}

function updateSessionLastUsed(refreshToken) {
    return new Promise((resolve, reject) => {
        sessionModel.updateLastUsed(
            refreshToken,
            (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(result);
            }
        );
    });
}

function revokeSession(refreshToken) {
    return new Promise((resolve, reject) => {
        sessionModel.revokeSession(
            refreshToken,
            (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(result);
            }
        );
    });
}

function getClientIp(req) {
    const forwardedFor = req.headers["x-forwarded-for"];

    if (
        typeof forwardedFor === "string" &&
        forwardedFor.trim()
    ) {
        return forwardedFor.split(",")[0].trim();
    }

    return req.ip || req.socket?.remoteAddress || null;
}

function getDeviceName(req) {
    const requestedDeviceName = req.body?.device_name;

    if (
        typeof requestedDeviceName === "string" &&
        requestedDeviceName.trim()
    ) {
        return requestedDeviceName.trim().slice(0, 100);
    }

    const userAgent = req.headers["user-agent"];

    if (
        typeof userAgent === "string" &&
        userAgent.trim()
    ) {
        return userAgent.trim().slice(0, 100);
    }

    return "Unknown device";
}

function generateAccessToken(user) {
    return jwt.sign(
        {
            id: user.id || user.user_id,
            worker_id: user.worker_id || null,
            username: user.username,
            role: user.role
        },
        process.env.JWT_SECRET,
        {
            expiresIn: ACCESS_TOKEN_EXPIRES_IN
        }
    );
}

async function issueLoginSession(req, res, user) {
    const accessToken = generateAccessToken(user);

    const refreshToken = crypto
        .randomBytes(32)
        .toString("hex");

    // Phiên đăng nhập không tự hết hạn theo thời gian.
    // Vẫn có thể thu hồi khi người dùng đăng xuất hoặc tài khoản bị khóa.
    const expiresAt = PERMANENT_SESSION_EXPIRES_AT;

    const userAgent =
        typeof req.headers["user-agent"] === "string"
            ? req.headers["user-agent"]
            : null;

    await createSession({
        user_id: user.id,
        refresh_token: refreshToken,
        device_id: crypto.randomUUID(),
        device_name: getDeviceName(req),
        user_agent: userAgent,
        ip_address: getClientIp(req),
        expires_at: expiresAt
    });

    // Làm nóng cache xác thực để các API ngay sau đăng nhập không phải
    // truy vấn lại users/workers qua TiDB cho từng request.
    setCachedAuthUser({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status || "active",
        worker_id: user.worker_id || null,
        worker_status: user.worker_status || (user.role === "worker" ? "active" : null)
    });

    const responseBody = {
        success: true,
        message: "Đăng nhập thành công",
        token: accessToken,
        accessToken,
        refreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
        user: {
            id: user.id,
            worker_id: user.worker_id || null,
            username: user.username,
            full_name: user.full_name,
            role: user.role
        }
    };

    res.status(200).json(responseBody);

    // Nhật ký không được làm chậm phản hồi đăng nhập. Việc ghi log chạy nền
    // sau khi token và thông tin người dùng đã được trả về client.
    void auditService.logActivity({
        userId: user.id,
        action: "LOGIN",
        entityType: "user_session",
        entityId: null,
        description: "Đăng nhập thành công",
        metadata: {
            role: user.role,
            login_mode:
                user.role === "worker"
                    ? "employee_code"
                    : "employee_code_password",
            device_name: getDeviceName(req)
        },
        req
    }).catch((auditError) => {
        console.error("Không thể ghi nhật ký đăng nhập:", auditError);
    });

    return;


}

exports.login = async (req, res) => {
    try {
        const username =
            typeof req.body?.username === "string"
                ? req.body.username.trim()
                : "";

        const password =
            typeof req.body?.password === "string"
                ? req.body.password
                : "";

        const accessType =
            req.body?.access_type === "worker" ||
            req.body?.access_type === "management"
                ? req.body.access_type
                : null;

        if (!username) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập mã nhân viên"
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error("Thiếu biến môi trường JWT_SECRET");

            return res.status(500).json({
                success: false,
                message: "Cấu hình xác thực chưa hợp lệ"
            });
        }

        const results = await findUserByUsername(username);

        if (results.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Mã nhân viên không tồn tại"
            });
        }

        const user = results[0];
        const userIsInactive = user.status !== "active";
        const workerIsInactive =
            user.role === "worker" &&
            user.worker_status !== "active";

        if (userIsInactive || workerIsInactive) {
            return res.status(403).json({
                success: false,
                message:
                    "Tài khoản đã bị khóa. Vui lòng liên hệ quản lý"
            });
        }

        /*
         * Luồng mới:
         * - Công nhân: chỉ cần mã nhân viên.
         * - Quản lý/tổ trưởng/admin: bắt buộc thêm mật khẩu.
         *
         * Nếu client cũ chưa gửi access_type, vẫn giữ cách đăng nhập
         * bằng username + password để không làm hỏng desktop cũ.
         */
        if (accessType === "worker") {
            if (user.role !== "worker") {
                return res.status(403).json({
                    success: false,
                    message:
                        "Mã nhân viên này không thuộc tài khoản công nhân"
                });
            }

            return issueLoginSession(req, res, user);
        }

        if (accessType === "management") {
            if (
                !["admin", "manager", "lead"].includes(
                    user.role
                )
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Mã nhân viên này không có quyền quản lý"
                });
            }

            if (!password) {
                return res.status(400).json({
                    success: false,
                    message: "Vui lòng nhập mật khẩu quản lý"
                });
            }
        } else if (!password) {
            return res.status(400).json({
                success: false,
                message: "Thiếu mật khẩu"
            });
        }

        const passwordIsValid = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordIsValid) {
            return res.status(401).json({
                success: false,
                message: "Mật khẩu không đúng"
            });
        }

        return issueLoginSession(req, res, user);
    } catch (error) {
        console.error("Lỗi đăng nhập:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể đăng nhập lúc này"
        });
    }
};

exports.refresh = async (req, res) => {
    try {
        const refreshToken =
            typeof req.body?.refreshToken === "string"
                ? req.body.refreshToken.trim()
                : "";

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: "Thiếu refresh token"
            });
        }

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                success: false,
                message: "Cấu hình xác thực chưa hợp lệ"
            });
        }

        const sessions =
            await findSessionByRefreshToken(refreshToken);

        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message:
                    "Phiên đăng nhập đã hết hạn hoặc không hợp lệ"
            });
        }

        const session = sessions[0];

        const userIsInactive =
            session.status !== "active";

        const workerIsInactive =
            session.role === "worker" &&
            session.worker_status !== "active";

        if (userIsInactive || workerIsInactive) {
            await revokeSession(refreshToken);

            return res.status(403).json({
                success: false,
                message:
                    "Tài khoản đã bị khóa. Vui lòng liên hệ quản lý"
            });
        }

        const accessToken =
            generateAccessToken(session);

        await updateSessionLastUsed(refreshToken);

        return res.status(200).json({
            success: true,
            message: "Làm mới phiên đăng nhập thành công",

            // Giữ tương thích trong giai đoạn chuyển đổi.
            token: accessToken,

            accessToken,
            expiresIn: ACCESS_TOKEN_EXPIRES_IN,

            user: {
                id: session.user_id,
                worker_id: session.worker_id || null,
                username: session.username,
                full_name: session.full_name,
                role: session.role
            }
        });
    } catch (error) {
        console.error("Lỗi làm mới token:", error);

        return res.status(500).json({
            success: false,
            message:
                "Không thể làm mới phiên đăng nhập lúc này"
        });
    }
};

exports.logout = async (req, res) => {
    try {
        const refreshToken =
            typeof req.body?.refreshToken === "string"
                ? req.body.refreshToken.trim()
                : "";

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: "Thiếu refresh token"
            });
        }

        await revokeSession(refreshToken);

        try {
            await auditService.logActivity({
                userId: req.user?.id || null,
                action: "LOGOUT",
                entityType: "user_session",
                entityId: null,
                description: "Đăng xuất",
                metadata: null,
                req
            });
        } catch (auditError) {
            console.error(
                "Không thể ghi nhật ký đăng xuất:",
                auditError
            );
        }

        return res.status(200).json({
            success: true,
            message: "Đăng xuất thành công"
        });
    } catch (error) {
        console.error("Lỗi đăng xuất:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể đăng xuất lúc này"
        });
    }
};