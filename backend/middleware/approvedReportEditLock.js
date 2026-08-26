// Serialize approved-report edits per report inside this Node process.
// Do NOT hold a MySQL pool connection while waiting: doing so can starve the
// pool and make the real transaction appear to deadlock on production_reports.
const pending = new Map();

function keyFor(reportId) {
  return `approved-report:${Number(reportId)}`;
}

module.exports = async function approvedReportEditLock(req, res, next) {
  const reportId = Number(req.params.id);
  if (!Number.isInteger(reportId) || reportId <= 0) return next();

  const key = keyFor(reportId);
  const previous = pending.get(key) || Promise.resolve();
  let releaseQueue;
  const current = new Promise((resolve) => {
    releaseQueue = resolve;
  });

  pending.set(key, current);

  // Wait for the previous save of the same report, but use no DB connection
  // while waiting. This prevents GET_LOCK/pool starvation and 409s caused by
  // concurrent Save requests from the manager grid.
  await previous;

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseQueue();
    if (pending.get(key) === current) pending.delete(key);
  };

  // Always release the queue slot when the HTTP response finishes/closes.
  res.once('finish', release);
  res.once('close', release);
  req.approvedReportEditLock = { name: key, release };

  return next();
};
