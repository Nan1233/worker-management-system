const jwt = require("jsonwebtoken");

/**
 * Xác thực nhanh cho các API chỉ đọc.
 * Token đã được ký bởi backend và có thời hạn ngắn, nên các endpoint danh mục
 * không cần truy vấn users/workers lại ở mọi request. Các API ghi dữ liệu vẫn
 * dùng authMiddleware đầy đủ để kiểm tra trạng thái tài khoản hiện tại.
 */
module.exports = (req, res, next) => {
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

    req.user = {
      ...decoded,
      id: userId,
      worker_id: decoded?.worker_id ? Number(decoded.worker_id) : null,
      role: String(decoded?.role || "").trim().toLowerCase(),
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      code: error?.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
      message: error?.name === "TokenExpiredError" ? "Phiên đăng nhập đã hết hạn" : "Token không hợp lệ",
    });
  }
};
