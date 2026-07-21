const jwt = require("jsonwebtoken");
const db = require("../config/db");

module.exports = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Không có token"
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Không chỉ tin trạng thái được ghi trong JWT. Kiểm tra lại DB ở mỗi request
        // để tài khoản bị khóa mất quyền ngay cả khi token cũ chưa hết hạn.
        const [rows] = await db.promise().query(
            `SELECT u.id, u.username, u.role, u.status,
                    w.id AS worker_id, w.status AS worker_status
             FROM users u
             LEFT JOIN workers w ON w.user_id = u.id
             WHERE u.id = ?
             LIMIT 1`,
            [decoded.id]
        );

        if (!rows.length) {
            return res.status(401).json({
                message: "Tài khoản không còn tồn tại"
            });
        }

        const currentUser = rows[0];
        const isLocked = currentUser.status !== "active"
            || (currentUser.role === "worker" && currentUser.worker_status !== "active");

        if (isLocked) {
            return res.status(403).json({
                code: "ACCOUNT_LOCKED",
                message: "Tài khoản đã bị khóa. Vui lòng liên hệ quản lý"
            });
        }

        req.user = {
            ...decoded,
            id: currentUser.id,
            username: currentUser.username,
            role: currentUser.role,
            worker_id: currentUser.worker_id
        };

        return next();
    } catch (error) {
        if (error?.code === "ER_ACCESS_DENIED_ERROR" || error?.code === "ECONNREFUSED") {
            console.error("Không thể kiểm tra trạng thái tài khoản:", error);
            return res.status(503).json({
                message: "Không thể xác thực tài khoản lúc này"
            });
        }

        return res.status(401).json({
            message: "Token không hợp lệ"
        });
    }
};
