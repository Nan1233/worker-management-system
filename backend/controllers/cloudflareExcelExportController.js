'use strict';

/**
 * Cloudflare Worker compatibility layer for Excel export.
 * ExcelJS/template rendering runs on the Node/Render backend.
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
    Accept: req.get('Accept') || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json',
    // Dedicated Render route: it bypasses the normal Cloudflare-compatibility
    // branch even when the Render environment still exposes KTC_CLOUDFLARE_WORKER.
    'X-KTC-Excel-Proxy': '1'
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(req.body || {})
  });

  const contentType = response.headers.get('content-type');
  if (contentType) res.setHeader('Content-Type', contentType);
  for (const header of ['content-disposition', 'content-length', 'cache-control', 'etag', 'x-ktc-excel-backend']) {
    const value = response.headers.get(header);
    if (value) res.setHeader(header, value);
  }

  const body = Buffer.from(await response.arrayBuffer());
  return res.status(response.status).send(body);
}

exports.exportGiaCongExcel = async (req, res, next) => {
  try {
    // Always target the explicit Node/Render endpoint. Do not send the
    // Cloudflare request back through the normal /export-excel route because
    // that route can intentionally return DESKTOP_EXCEL_REQUIRED/503 in
    // server-heavy-excel-disabled configurations.
    return await proxyExcelRequest(req, res, '/reports/export-excel/render-proxy');
  } catch (error) {
    error.code = error.code || 'KTC_EXCEL_RENDER_PROXY_FAILED';
    return next(error);
  }
};

exports.exportProcess = async (req, res, next) => {
  try {
    return await proxyExcelRequest(req, res, '/reports/export-excel/process/render-proxy');
  } catch (error) {
    error.code = error.code || 'KTC_PROCESS_EXCEL_RENDER_PROXY_FAILED';
    return next(error);
  }
};
