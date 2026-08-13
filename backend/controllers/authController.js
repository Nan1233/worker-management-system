const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const userModel = require("../models/userModel");
const refreshSessionService = require("../services/refreshSessionService");
const auditService = require("../services/auditService");
const { setCachedAuthUser } = require("../utils/authUserCache");

const ACCESS_TOKEN_EXPIRES_IN =
    process.env.ACCESS_TOKEN_EXPIRES_IN || "1h";

const REFRESH_TOKEN_TTL_DAYS = Math.max(1, Number(process.env.REFRESH_TOKEN_TTL_DAYS || 90));

const REFRESH_COOKIE_NAME = "ktc_refresh_token";

function parseCookie(req, name) {
    const cookieHeader = String(req.headers.cookie || "");
    for (const part of cookieHeader.split(";")) {
        const separator = part.indexOf("=");
        if (separator < 0) continue;
        const key = part.slice(0, separator).trim();
        if (key !== name) continue;
        try {
            return decodeURIComponent(part.slice(separator + 1).trim());
        } catch {
            return part.slice(separator + 1).trim();
        }
    }
    return "";
}

function getRequestRefreshToken(req) {
    const bodyToken = typeof req.body?.refreshToken === "string"
        ? req.body.refreshToken.trim()
        : "";
    return bodyToken || parseCookie(req, REFRESH_COOKIE_NAME);
}

function setRefreshCookie(res, refreshToken, expiresAt = null) {
    const absoluteExpiry = expiresAt ? new Date(expiresAt).getTime() : NaN;
    const remainingMs = Number.isFinite(absoluteExpiry)
        ? Math.max(0, absoluteExpiry - Date.now())
        : REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: remainingMs,
        path: "/api/auth",
    });
}

function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/api/auth",
    });
}

function shouldReturnRefreshToken(req) {
    // Electron keeps a body-token fallback because file:// renderer cookie behavior
    // differs by platform. Chromium file:// requests may omit Origin or send the
    // opaque value "null". HTTP(S) browser origins must keep refresh tokens
    // HttpOnly-only. Browser JavaScript cannot set a forged User-Agent header.
    const userAgent = String(req.headers["user-agent"] || "");
    const origin = String(req.headers.origin || "").trim().toLowerCase();
    const isOpaqueNativeOrigin = !origin || origin === "null" || origin.startsWith("file:");
    return /electron/i.test(userAgent) && isOpaqueNativeOrigin;
}

function getRefreshTokenExpiresAt() {
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    return expiresAt.toISOString().slice(0, 19).replace("T", " ");
}

function findExactUserByUsername(username) {
    return new Promise((resolve, reject) => {
        userModel.findExactByUsername(username, (error, results) => {
            if (error) return reject(error);
            resolve(results || []);
        });
    });
}

function findUsersByWorkerCode(workerCode) {
    return new Promise((resolve, reject) => {
        userModel.findAllByWorkerCode(workerCode, (error, results) => {
            if (error) return reject(error);
            resolve(results || []);
        });
    });
}

async function resolveLoginAccount(loginName) {
    // 1) Username luôn được ưu tiên tuyệt đối.
    const exactUsers = await findExactUserByUsername(loginName);
    if (exactUsers.length > 0) {
        return { user: exactUsers[0], ambiguous: false, matchedBy: "username" };
    }

    // 2) Chỉ fallback sang mã công nhân khi không có username trùng chính xác.
    const workerUsers = await findUsersByWorkerCode(loginName);
    if (workerUsers.length === 1) {
        return { user: workerUsers[0], ambiguous: false, matchedBy: "worker_code" };
    }
    if (workerUsers.length > 1) {
        return {
            user: null,
            ambiguous: true,
            matchedBy: "worker_code",
            usernames: workerUsers.map((item) => item.username)
        };
    }
    return { user: null, ambiguous: false, matchedBy: null };
}

function getClientIp(req) {
    // Express req.ip already applies the deployment-aware trust-proxy policy.
    // Never trust raw X-Forwarded-For directly here.
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
            worker_code: user.worker_code || null,
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
    const previousRefreshToken =
        (typeof req.body?.previous_refresh_token === "string"
            ? req.body.previous_refresh_token.trim()
            : "") || parseCookie(req, REFRESH_COOKIE_NAME);

    // Khi đổi tài khoản, thu hồi phiên cũ trước khi tạo phiên mới. Điều này
    // ngăn tab/PWA cũ dùng refresh token trước đó để ghi đè tài khoản vừa đăng nhập.
    if (previousRefreshToken) {
        try {
            await refreshSessionService.revokeFamilyByRefreshToken(previousRefreshToken);
        } catch (revokeError) {
            console.warn("Không thể thu hồi phiên trước khi đổi tài khoản:", revokeError?.message || revokeError);
        }
    }

    const expiresAt = getRefreshTokenExpiresAt();
    const userAgent =
        typeof req.headers["user-agent"] === "string"
            ? req.headers["user-agent"]
            : null;

    // Persist family root before exposing any usable refresh credential.
    const rootSession = await refreshSessionService.createFamilyRoot({
        user_id: user.id,
        device_id: crypto.randomUUID(),
        device_name: getDeviceName(req),
        user_agent: userAgent,
        ip_address: getClientIp(req),
        expires_at: expiresAt
    });
    const refreshToken = rootSession.refreshToken;
    const accessToken = generateAccessToken(user);

    // Làm nóng cache xác thực để các API ngay sau đăng nhập không phải
    // truy vấn lại users/workers qua TiDB cho từng request.
    setCachedAuthUser({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status || "active",
        worker_id: user.worker_id || null,
        worker_code: user.worker_code || null,
        worker_status: user.worker_status || (user.role === "worker" ? "active" : null)
    });

    setRefreshCookie(res, refreshToken, rootSession.expiresAt);

    const responseBody = {
        success: true,
        message: "Đăng nhập thành công",
        token: accessToken,
        accessToken,
        ...(shouldReturnRefreshToken(req) ? { refreshToken } : {}),
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
        user: {
            id: user.id,
            worker_id: user.worker_id || null,
            worker_code: user.worker_code || null,
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

        const resolvedAccount = await resolveLoginAccount(username);

        if (resolvedAccount.ambiguous) {
            console.error("AUTH_ACCOUNT_AMBIGUOUS", {
                login: username,
                candidateCount: resolvedAccount.usernames.length
            });
            return res.status(409).json({
                success: false,
                code: "ACCOUNT_AMBIGUOUS",
                message: "Mã công nhân này đang có nhiều tài khoản. Vui lòng đăng nhập bằng tên đăng nhập cụ thể."
            });
        }

        if (!resolvedAccount.user) {
            return res.status(401).json({
                success: false,
                code: "ACCOUNT_NOT_FOUND",
                message: "Tên đăng nhập hoặc mã công nhân không tồn tại"
            });
        }

        const user = resolvedAccount.user;
        const userIsInactive = user.status !== "active";
        const workerIsInactive =
            user.role === "worker" &&
            user.worker_status !== "active";

        if (userIsInactive || workerIsInactive) {
            return res.status(403).json({
                success: false,
                code: userIsInactive ? "USER_INACTIVE" : "WORKER_INACTIVE",
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

        const databaseUnavailable = [
            "ECONNREFUSED",
            "ETIMEDOUT",
            "PROTOCOL_CONNECTION_LOST",
            "ER_ACCESS_DENIED_ERROR"
        ].includes(error?.code);

        return res.status(databaseUnavailable ? 503 : 500).json({
            success: false,
            code: databaseUnavailable ? "AUTH_DATABASE_UNAVAILABLE" : "AUTH_LOGIN_FAILED",
            message: databaseUnavailable
                ? "Hệ thống dữ liệu đang khởi động lại. Vui lòng thử lại sau ít phút"
                : "Không thể đăng nhập lúc này"
        });
    }
};

exports.refresh = async (req, res) => {
    try {
        const refreshToken = getRequestRefreshToken(req);
        if (!refreshToken) {
            clearRefreshCookie(res);
            return res.status(400).json({ success: false, code: "REFRESH_TOKEN_INVALID", message: "Thiếu refresh token" });
        }
        if (!process.env.JWT_SECRET) {
            return res.status(500).json({ success: false, message: "Cấu hình xác thực chưa hợp lệ" });
        }

        const rotated = await refreshSessionService.rotateRefreshToken({
            refreshToken,
            userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
            ipAddress: getClientIp(req),
        });
        const session = rotated.user;
        const accessToken = generateAccessToken(session);

        setCachedAuthUser({
            id: session.user_id,
            username: session.username,
            role: session.role,
            status: session.status,
            worker_id: session.worker_id || null,
            worker_code: session.worker_code || null,
            worker_status: session.worker_status || null
        });

        setRefreshCookie(res, rotated.refreshToken, rotated.expiresAt);
        return res.status(200).json({
            success: true,
            message: "Làm mới phiên đăng nhập thành công",
            token: accessToken,
            accessToken,
            ...(shouldReturnRefreshToken(req) ? { refreshToken: rotated.refreshToken } : {}),
            expiresIn: ACCESS_TOKEN_EXPIRES_IN,
            user: {
                id: session.user_id,
                worker_id: session.worker_id || null,
                worker_code: session.worker_code || null,
                username: session.username,
                full_name: session.full_name,
                role: session.role
            }
        });
    } catch (error) {
        const code = error?.code || "REFRESH_TOKEN_INVALID";
        const securityCodes = new Set([
            "REFRESH_TOKEN_INVALID", "REFRESH_TOKEN_EXPIRED", "REFRESH_TOKEN_REVOKED",
            "REFRESH_TOKEN_REUSE_DETECTED", "SESSION_USER_DISABLED", "REFRESH_TOKEN_RELOGIN_REQUIRED"
        ]);
        if (securityCodes.has(code)) {
            clearRefreshCookie(res);
            const status = code === "SESSION_USER_DISABLED" ? 403 : 401;
            return res.status(status).json({
                success: false,
                code,
                message: code === "SESSION_USER_DISABLED"
                    ? "Tài khoản đã bị khóa. Vui lòng đăng nhập lại"
                    : "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại"
            });
        }
        console.error("Lỗi làm mới token:", error?.message || error);
        return res.status(500).json({ success: false, message: "Không thể làm mới phiên đăng nhập lúc này" });
    }
};

exports.logout = async (req, res) => {
    try {
        const refreshToken = getRequestRefreshToken(req);

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: "Thiếu refresh token"
            });
        }

        await refreshSessionService.revokeFamilyByRefreshToken(refreshToken);
        clearRefreshCookie(res);

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