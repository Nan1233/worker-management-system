const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { getOrLoadAuthUser, setCachedAuthUser } = require("../utils/authUserCache");

function normalize(value) { return String(value ?? "").trim().toLowerCase(); }
function isDatabaseUnavailable(error) { return ["ER_ACCESS_DENIED_ERROR","ECONNREFUSED","ETIMEDOUT","PROTOCOL_CONNECTION_LOST","ECONNRESET"].includes(error?.code); }

async function loadCurrentUser(decoded) {
    const decodedUserId = Number(decoded?.id);
    const decodedWorkerId = Number(decoded?.worker_id);
    const decodedUsername = String(decoded?.username || "").trim();
    if (Number.isInteger(decodedUserId) && decodedUserId > 0) {
        const [rows] = await db.promise().query(`SELECT u.id,u.username,u.role,u.status,w.id AS worker_id,w.status AS worker_status,DATABASE() AS database_name FROM users u LEFT JOIN workers w ON w.user_id=u.id WHERE u.id=? LIMIT 1`, [decodedUserId]);
        if (rows[0]) return rows[0];
    }
    const conditions = [], params = [];
    if (decodedUsername) { conditions.push("TRIM(u.username)=?"); params.push(decodedUsername); }
    if (Number.isInteger(decodedWorkerId) && decodedWorkerId > 0) { conditions.push("w.id=?"); params.push(decodedWorkerId); }
    if (Number.isInteger(decodedUserId) && decodedUserId > 0) { conditions.push("w.id=?"); params.push(decodedUserId); }
    if (!conditions.length) return null;
    const [rows] = await db.promise().query(`SELECT u.id,u.username,u.role,u.status,w.id AS worker_id,w.status AS worker_status,DATABASE() AS database_name FROM users u LEFT JOIN workers w ON w.user_id=u.id WHERE ${conditions.join(" OR ")} ORDER BY CASE WHEN TRIM(u.username)=? THEN 0 ELSE 1 END,u.id LIMIT 1`, [...params, decodedUsername]);
    return rows[0] || null;
}

module.exports = async (req,res,next) => {
    const [scheme,token] = String(req.headers.authorization || "").split(" ");
    if (scheme !== "Bearer" || !token) return res.status(401).json({code:"TOKEN_MISSING",message:"Không có token"});
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const decodedUserId = Number(decoded?.id), decodedWorkerId = Number(decoded?.worker_id), decodedUsername = String(decoded?.username || "").trim();
        if ((!Number.isInteger(decodedUserId)||decodedUserId<=0) && (!Number.isInteger(decodedWorkerId)||decodedWorkerId<=0) && !decodedUsername) return res.status(401).json({code:"TOKEN_USER_INVALID",message:"Thông tin tài khoản trong token không hợp lệ"});
        const cacheKey = Number.isInteger(decodedUserId)&&decodedUserId>0 ? decodedUserId : Number.isInteger(decodedWorkerId)&&decodedWorkerId>0 ? decodedWorkerId : decodedUsername;
        const currentUser = await getOrLoadAuthUser(cacheKey, () => loadCurrentUser(decoded));
        if (!currentUser) return res.status(401).json({code:"TOKEN_USER_NOT_FOUND",message:"Phiên đăng nhập cần được làm mới"});
        setCachedAuthUser(currentUser);
        const role = normalize(currentUser.role), userStatus = normalize(currentUser.status), workerStatus = normalize(currentUser.worker_status);
        if (userStatus !== "active" || (role === "worker" && (!currentUser.worker_id || workerStatus !== "active"))) return res.status(403).json({code:userStatus!=="active"?"USER_INACTIVE":"WORKER_INACTIVE",message:"Tài khoản đã bị khóa. Vui lòng liên hệ quản lý"});
        req.user = {...decoded,id:Number(currentUser.id),username:currentUser.username,role,worker_id:currentUser.worker_id?Number(currentUser.worker_id):null};
        // Diagnostic only: records the role actually loaded from DB for requests to the approved-report API.
        if (String(req.path || "").startsWith("/production/") && req.method === "PUT") console.info("[AUTH DEBUG] PRODUCTION_PUT_USER", JSON.stringify({userId:req.user.id,role:req.user.role,workerId:req.user.worker_id,path:req.originalUrl||req.path,requestId:req.requestId||null}));
        return next();
    } catch(error) {
        if (isDatabaseUnavailable(error)) return res.status(503).json({code:"AUTH_DATABASE_UNAVAILABLE",message:"Không thể xác thực tài khoản lúc này"});
        console.error("AUTH_TOKEN_ERROR",{name:error?.name,message:error?.message});
        return res.status(401).json({code:error?.name==="TokenExpiredError"?"TOKEN_EXPIRED":"TOKEN_INVALID",message:error?.name==="TokenExpiredError"?"Phiên đăng nhập đã hết hạn":"Token không hợp lệ"});
    }
};
