const db = require('../config/db');

const LOCK_PREFIX = 'ktc:approved-report-edit:';
const MAX_LOCK_NAME_LENGTH = 64;
const LOCK_WAIT_SECONDS = 15;

function lockName(reportId) {
  return `${LOCK_PREFIX}${Number(reportId)}`.slice(0, MAX_LOCK_NAME_LENGTH);
}

module.exports = async function approvedReportEditLock(req, res, next) {
  const reportId = Number(req.params.id);
  if (!Number.isInteger(reportId) || reportId <= 0) return next();

  const name = lockName(reportId);
  let connection;
  let acquired = false;

  try {
    connection = await db.promise().getConnection();

    // Serialize saves for the same report instead of rejecting the next click
    // immediately. This is important because the manager grid may legitimately
    // issue more than one PUT while the user presses Save once or while pending
    // edits are flushed. Different report IDs still run independently.
    const [rows] = await connection.query(
      'SELECT GET_LOCK(?, ?) AS acquired',
      [name, LOCK_WAIT_SECONDS]
    );
    acquired = Number(rows?.[0]?.acquired) === 1;

    if (!acquired) {
      connection.release();
      connection = null;
      return res.status(409).json({
        success: false,
        code: 'REPORT_UPDATE_IN_PROGRESS',
        message: 'Báo cáo vẫn đang được lưu. Vui lòng chờ thao tác trước hoàn tất rồi thử lại.'
      });
    }

    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      try {
        if (connection && acquired) {
          await connection.query('SELECT RELEASE_LOCK(?) AS released', [name]);
        }
      } catch (error) {
        console.error('APPROVED REPORT LOCK RELEASE ERROR:', error);
      } finally {
        if (connection) connection.release();
        connection = null;
      }
    };

    res.once('finish', release);
    res.once('close', release);

    req.approvedReportEditLock = { name, release };
    return next();
  } catch (error) {
    if (connection) {
      try {
        if (acquired) {
          await connection.query('SELECT RELEASE_LOCK(?) AS released', [name]);
        }
      } catch (_) {
        // Closing the connection also releases a connection-scoped GET_LOCK.
      }
      connection.release();
    }
    return next(error);
  }
};
