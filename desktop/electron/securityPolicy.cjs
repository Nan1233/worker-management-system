'use strict';

const path = require('node:path');

const DEFAULT_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_PREVIEW_TTL_MS = 10 * 60 * 1000;

function normalizedFilePathFromUrl(targetUrl) {
  try {
    const url = new URL(String(targetUrl || ''));
    if (url.protocol !== 'file:') return null;
    let pathname = decodeURIComponent(url.pathname || '');
    if (process.platform === 'win32' && /^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1);
    return path.resolve(pathname);
  } catch {
    return null;
  }
}

function isTrustedRendererNavigation(targetUrl, trustedFiles = []) {
  const candidate = normalizedFilePathFromUrl(targetUrl);
  if (!candidate) return false;
  const trusted = new Set((trustedFiles || []).map((file) => path.resolve(String(file || ''))));
  return trusted.has(candidate);
}

function isSafeExternalUrl(targetUrl) {
  try {
    const url = new URL(String(targetUrl || ''));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isRetrySafeMethod(method) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').trim().toUpperCase());
}

function assertImportFileSize(statOrSize, maxBytes = DEFAULT_IMPORT_MAX_BYTES) {
  const size = typeof statOrSize === 'number' ? statOrSize : Number(statOrSize?.size || 0);
  if (!Number.isFinite(size) || size < 0) {
    const error = new Error('Không xác định được kích thước file Excel import.');
    error.code = 'KTC_IMPORT_FILE_STAT_INVALID';
    throw error;
  }
  if (size > maxBytes) {
    const error = new Error(`File Excel import vượt giới hạn ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    error.code = 'KTC_IMPORT_FILE_TOO_LARGE';
    throw error;
  }
  return size;
}

class ReportImportPreviewGuard {
  constructor({ ttlMs = DEFAULT_PREVIEW_TTL_MS, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.preview = null;
  }

  remember(filePath) {
    this.preview = { filePath: path.resolve(String(filePath || '')), createdAt: this.now() };
    return this.preview.filePath;
  }

  assertAllowed(filePath) {
    const candidate = path.resolve(String(filePath || ''));
    if (!this.preview) return this.#error('KTC_IMPORT_PREVIEW_REQUIRED', 'Hãy chọn và xem trước file Excel trước khi áp dụng.');
    if (this.now() - this.preview.createdAt > this.ttlMs) {
      this.preview = null;
      return this.#error('KTC_IMPORT_PREVIEW_EXPIRED', 'Phiên xem trước file Excel đã hết hạn. Hãy chọn lại file.');
    }
    if (candidate !== this.preview.filePath) {
      return this.#error('KTC_IMPORT_FILE_MISMATCH', 'File áp dụng không khớp file đã được chọn và xem trước.');
    }
    return candidate;
  }

  consume(filePath) {
    const candidate = this.assertAllowed(filePath);
    this.preview = null;
    return candidate;
  }

  clear() { this.preview = null; }

  #error(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

module.exports = {
  DEFAULT_IMPORT_MAX_BYTES,
  DEFAULT_PREVIEW_TTL_MS,
  normalizedFilePathFromUrl,
  isTrustedRendererNavigation,
  isSafeExternalUrl,
  isRetrySafeMethod,
  assertImportFileSize,
  ReportImportPreviewGuard,
};
