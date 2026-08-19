const inFlight = new Map();
const RECENT_TTL_MS = Math.max(3000, Number(process.env.EXPORT_DUPLICATE_WINDOW_MS || 5000));

function getIdentity(req) {
  return String(req.user?.id ?? req.user?.user_id ?? req.user?.employee_code ?? req.ip ?? 'anonymous');
}

function getRequestKey(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const date = String(body.date || req.query?.date || '').trim();
  const processId = String(body.processId ?? req.query?.processId ?? '').trim();
  const groupCode = String(body.groupCode ?? req.query?.groupCode ?? '').trim();
  return `${req.method}:${req.path}:${getIdentity(req)}:${date}:${processId}:${groupCode}`;
}

function exportRequestGuard(req, res, next) {
  const key = getRequestKey(req);
  const now = Date.now();
  const existing = inFlight.get(key);

  if (existing && existing.expiresAt > now) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((existing.expiresAt - now) / 1000))));
    return res.status(409).json({
      success: false,
      code: 'EXPORT_REQUEST_IN_PROGRESS',
      message: 'Yêu cầu xuất Excel giống nhau đang được xử lý hoặc vừa hoàn tất. Vui lòng chờ trước khi thử lại.'
    });
  }

  const entry = { expiresAt: now + RECENT_TTL_MS };
  inFlight.set(key, entry);

  setTimeout(() => {
    const current = inFlight.get(key);
    if (current === entry) inFlight.delete(key);
  }, RECENT_TTL_MS).unref?.();

  return next();
}

module.exports = { exportRequestGuard };
