const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { getOrLoadAuthUser } = require("../utils/authUserCache");

function normalize(value) { return String(value ?? "").trim().toLowerCase(); }
function isDatabaseUnavailable(error) {
  return ["ER_ACCESS_DENIED_ERROR","ECONNREFUSED","ETIMEDOUT","PROTOCOL_CONNECTION_LOST","ECONNRESET"].includes(error?.code);
}

async function loadCurrentUser(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [rows] = await db.promise().query(
    `SELECT u.id,u.username,u.role,u.status,w.id AS worker_id,w.status AS worker_status,DATABASE() AS database_name
     FROM users u
     LEFT JOIN workers w ON w.user_id=u.id
     WHERE u.id=? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Xác thực nhanh cho các API chỉ đọc.
 * Vẫn xác nhận user/worker hiện tại từ DB và cache kết quả ngắn hạn,
 * nên role/status trong JWT không được tin cậy độc lập.
 */
module.exports = async (req, res, next) => {
  const authorization = String(req.headers.authorization || "");
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ code: "TOKEN_MISSING", message: "Không có token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = Number(decoded?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ code: "TOKEN_USER_INVALID", message: "Thông tin tài khoản trong token không hợp lệ" });
    }

    const currentUser = await getOrLoadAuthUser(userId, () => loadCurrentUser(userId));
    if (!currentUser) {
      return res.status(401).json({ code: "TOKEN_USER_NOT_FOUND", message: "Phiên đăng nhập cần được làm mới" });
    }

    const role = normalize(currentUser.role);
    const userStatus = normalize(currentUser.status);
    const workerStatus = normalize(currentUser.worker_status);
    if (userStatus !== "active" || (role === "worker" && (!currentUser.worker_id || workerStatus !== "active"))) {
      return res.status(403).json({
        code: userStatus !== "active" ? "USER_INACTIVE" : "WORKER_INACTIVE",
        message: "Tài khoản đã bị khóa. Vui lòng liên hệ quản lý"
      });
    }

    req.user = {
      ...decoded,
      id: Number(currentUser.id),
      username: currentUser.username,
      role,
      worker_id: currentUser.worker_id ? Number(currentUser.worker_id) : null,
    };

    return next();
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return res.status(503).json({ code: "AUTH_DATABASE_UNAVAILABLE", message: "Không thể xác thực tài khoản lúc này" });
    }
    return res.status(401).json({
      code: error?.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
      message: error?.name === "TokenExpiredError" ? "Phiên đăng nhập đã hết hạn" : "Token không hợp lệ",
    });
  }
};
