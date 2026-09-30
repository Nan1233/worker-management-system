const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');
const queue = require('../services/excelExportJobQueue');
const store = require('../services/excelExportJobStore');

const POLL_MS = Math.max(250, Number(process.env.EXCEL_COMPAT_POLL_MS || 500));
const TIMEOUT_MS = Math.max(30000, Number(process.env.EXCEL_COMPAT_TIMEOUT_MS || 300000));

function sendFile(res, job) {
  const filePath = job?.result?.path || job?.result?.archivePath;
  if (!filePath) {
    const error = new Error('Tác vụ Excel hoàn thành nhưng không có file kết quả.');
    error.statusCode = 404;
    throw error;
  }

  return fs.stat(filePath).then(async (stat) => {
    if (!stat.isFile() || stat.size <= 0) {
      const error = new Error('File kết quả Excel không hợp lệ.');
      error.statusCode = 404;
      throw error;
    }
    const extension = path.extname(filePath).toLowerCase();
    const contentType = extension === '.zip'
      ? 'application/zip'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const fileName = job.result?.fileName || path.basename(filePath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'private, no-store');
    await pipeline(fsSync.createReadStream(filePath), res);
  });
}

async function waitForJob(jobId) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const job = await store.get(jobId);
    if (!job) {
      const error = new Error('Không tìm thấy tác vụ Excel vừa tạo.');
      error.statusCode = 404;
      throw error;
    }
    if (job.status === 'completed') return job;
    if (job.status === 'failed') {
      const error = new Error(job.error || 'Tác vụ Excel thất bại.');
      error.statusCode = 500;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  const error = new Error('Tác vụ Excel vượt quá thời gian chờ.');
  error.statusCode = 504;
  throw error;
}

exports.exportGiaCongExcel = async (req, res, next) => {
  try {
    const date = String(req.body?.date || '').trim();
    if (!date) return res.status(400).json({ success: false, code: 'INVALID_DATE', message: 'Thiếu ngày xuất Excel.' });

    const job = await queue.enqueue('monthly', { yearMonth: date.slice(0, 7) }, {
      requestedBy: req.user?.id,
      maxAttempts: 1
    });
    const completed = await waitForJob(job.id);
    await sendFile(res, completed);
  } catch (error) {
    if (res.headersSent) return res.end();
    return next(error);
  }
};
