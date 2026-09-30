'use strict';

/**
 * Cloudflare Worker compatibility layer for Excel export.
 *
 * ExcelJS/template rendering requires Node filesystem APIs and therefore must
 * run on the Render/Node backend. The Cloudflare Worker keeps the public API
 * URL stable and proxies only the authenticated Excel request to the Node
 * backend, returning the original XLSX response unchanged.
 */

const DEFAULT_RENDER_API_BASE = 'https://worker-management-system-2-5jqv.onrender.com/api';

function renderApiBase() {
  return String(
    process.env.KTC_RENDER_API_BASE_URL ||
    process.env.EXCEL_RENDER_API_BASE_URL ||
    DEFAULT_RENDER_API_BASE
  ).trim().replace(/\/+$/, '');
}

async function proxyExcelRequest(req, res, path) {
  const url = `${renderApiBase()}${path}`;
  const headers = {
    Authorization: req.get('Authorization') || '',
    'Content-Type': req.get('Content-Type') || 'application/json',
    Accept: req.get('Accept') || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json'
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(req.body || {})
  });

  const contentType = response.headers.get('content-type');
  if (contentType) res.setHeader('Content-Type', contentType);

  for (const header of ['content-disposition', 'content-length', 'cache-control', 'etag']) {
    const value = response.headers.get(header);
    if (value) res.setHeader(header, value);
  }

  const body = Buffer.from(await response.arrayBuffer());
  return res.status(response.status).send(body);
}

exports.exportGiaCongExcel = async (req, res, next) => {
  try {
    return await proxyExcelRequest(req, res, '/reports/export-excel');
  } catch (error) {
    error.code = error.code || 'KTC_EXCEL_RENDER_PROXY_FAILED';
    return next(error);
  }
};

exports.exportProcess = async (req, res, next) => {
  try {
    return await proxyExcelRequest(req, res, '/reports/export-excel/process');
  } catch (error) {
    error.code = error.code || 'KTC_PROCESS_EXCEL_RENDER_PROXY_FAILED';
    return next(error);
  }
};
