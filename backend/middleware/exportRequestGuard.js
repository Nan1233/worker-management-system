const inFlight = new Map();

const RETRY_AFTER_SECONDS = 5;

function getIdentity(req) {
  return String(
    req.user?.id ??
    req.user?.user_id ??
    req.user?.employee_code ??
    req.ip ??
    'anonymous'
  );
}

function getRequestKey(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const date = String(body.date || req.query?.date || '').trim();
  const processId = String(
    body.processId ?? req.query?.processId ?? ''
  ).trim();
  const groupCode = String(
    body.groupCode ?? req.query?.groupCode ?? ''
  ).trim();

  return `${req.method}:${req.path}:${getIdentity(req)}:${date}:${processId}:${groupCode}`;
}

function exportRequestGuard(req, res, next) {
  const key = getRequestKey(req);
  const existing = inFlight.get(key);

  if (existing) {
    res.setHeader(
      'Retry-After',
      String(RETRY_AFTER_SECONDS)
    );

    return res.status(409).json({
      success: false,
      code: 'EXPORT_REQUEST_IN_PROGRESS',
      message:
        'Yêu cầu xuất Excel giống nhau đang được xử lý hoặc vừa hoàn tất. Vui lòng chờ trước khi thử lại.'
    });
  }

  const entry = {};

  inFlight.set(key, entry);

  const release = () => {
    const current = inFlight.get(key);
    if (current !== entry) return;
    inFlight.delete(key);
  };

  // Chỉ giữ khóa khi request thật sự còn đang chạy.
  // Khi response đã kết thúc, request cùng loại được phép chạy lại ngay.
  res.once('finish', release);
  res.once('close', release);

  // Never expire an in-flight request by timer: a slow export must still
  // prevent another request from writing the same workbook. Finish/close
  // events release the entry, and process exit clears the in-memory map.

  return next();
}

module.exports = { exportRequestGuard };