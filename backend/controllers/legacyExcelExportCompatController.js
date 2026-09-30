const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');
const { buildMonthlyWorkbook } = require('../services/monthlyExcelService');

async function sendFile(res, result) {
  const filePath = result?.path || result?.archivePath;
  if (!filePath) {
    const error = new Error('Tác vụ Excel hoàn thành nhưng không có file kết quả.');
    error.statusCode = 404;
    throw error;
  }

  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size <= 0) {
    const error = new Error('File kết quả Excel không hợp lệ.');
    error.statusCode = 404;
    throw error;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = extension === '.zip'
    ? 'application/zip'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const fileName = result.fileName || path.basename(filePath);

  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Cache-Control', 'private, no-store');

  await pipeline(fsSync.createReadStream(filePath), res);
}

exports.exportGiaCongExcel = async (req, res, next) => {
  try {
    const date = String(req.body?.date || '').trim();
    if (!date) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_DATE',
        message: 'Thiếu ngày xuất Excel.'
      });
    }

    const yearMonth = date.slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_DATE',
        message: 'Ngày xuất Excel không hợp lệ.'
      });
    }

    // Desktop endpoint vẫn trả binary như contract cũ. Không tạo Excel job
    // nữa vì job worker đang gây HTTP 500 trong runtime backend hiện tại.
    // monthlyExcelService đã có inFlightBuilds để chống chạy trùng cùng tháng.
    const result = await buildMonthlyWorkbook(yearMonth);
    await sendFile(res, result);
  } catch (error) {
    if (res.headersSent) return res.end();
    return next(error);
  }
};
