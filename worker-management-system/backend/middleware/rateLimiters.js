const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const {
  authenticatedIdentityKey,
  requestUserKey,
  routeUserKey,
  loginAccountKey,
  loginNetworkKey,
  refreshCredentialKey,
} = require('../services/rateLimitIdentityService');

function limitMessage(code, message) {
  return { success: false, code, message };
}

function common(options) {
  const { windowMs, message } = options;
  return rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    statusCode: 429,
    handler: (req, res) => {
      const resetAt = req.rateLimit?.resetTime instanceof Date ? req.rateLimit.resetTime.getTime() : 0;
      const retryAfterSeconds = Math.max(1, Math.ceil(((resetAt || (Date.now() + windowMs)) - Date.now()) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json(message);
    },
    ...options,
  });
}

const globalApiLimiter = common({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT || 600),
  skip: (req) => req.path === '/health' || req.path === '/health/live' || req.path === '/health/ready',
  keyGenerator: (req) => authenticatedIdentityKey(req, (token) => jwt.verify(token, process.env.JWT_SECRET)),
  message: limitMessage('RATE_LIMITED', 'Quá nhiều yêu cầu, vui lòng thử lại sau'),
});

const loginAccountLimiter = common({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_ACCOUNT_RATE_LIMIT || process.env.LOGIN_RATE_LIMIT || 30),
  skipSuccessfulRequests: true,
  keyGenerator: loginAccountKey,
  message: limitMessage('LOGIN_RATE_LIMITED', 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.'),
});

const loginNetworkLimiter = common({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_NETWORK_RATE_LIMIT || 300),
  skipSuccessfulRequests: true,
  keyGenerator: loginNetworkKey,
  message: limitMessage('LOGIN_NETWORK_RATE_LIMITED', 'Có quá nhiều lần đăng nhập thất bại từ kết nối này. Vui lòng thử lại sau.'),
});

const refreshLimiter = common({
  windowMs: 5 * 60 * 1000,
  limit: Number(process.env.REFRESH_RATE_LIMIT || 60),
  keyGenerator: refreshCredentialKey,
  message: limitMessage('REFRESH_RATE_LIMITED', 'Yêu cầu làm mới phiên quá nhiều. Vui lòng thử lại sau.'),
});

const workerReportLimiter = common({
  windowMs: 60 * 1000,
  limit: Number(process.env.WORKER_REPORT_RATE_LIMIT || 30),
  keyGenerator: requestUserKey,
  message: limitMessage('WORKER_REPORT_RATE_LIMITED', 'Bạn gửi báo cáo quá nhanh. Vui lòng thử lại sau.'),
});

const expensiveUserLimiter = common({
  windowMs: 5 * 60 * 1000,
  limit: Number(process.env.EXPENSIVE_API_RATE_LIMIT || 30),
  keyGenerator: routeUserKey,
  message: limitMessage('EXPENSIVE_RATE_LIMITED', 'Tác vụ này được gọi quá nhiều lần. Vui lòng thử lại sau.'),
});

module.exports = {
  globalApiLimiter,
  loginAccountLimiter,
  loginNetworkLimiter,
  refreshLimiter,
  workerReportLimiter,
  expensiveUserLimiter,
};
