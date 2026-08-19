const fs = require('node:fs/promises');
const path = require('node:path');

const SECRET_KEY_PATTERN = /(password|token|authorization|cookie|secret|credential)/i;
const PATH_KEY_PATTERN = /(filePath|backupPath|pendingPath|replacementPath|folder|userData|exportRoot|frontendIndex|processBackupRoot)$/i;
const URL_KEY_PATTERN = /(url|uri)$/i;

function safeUrlForLog(value) {
  try {
    const parsed = new URL(String(value));
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(value || '').split('?')[0].split('#')[0];
  }
}

function sanitizeLogDetails(value, key = '', seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (SECRET_KEY_PATTERN.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    if (URL_KEY_PATTERN.test(key)) return safeUrlForLog(value);
    if (PATH_KEY_PATTERN.test(key)) return value.includes('\\') ? path.win32.basename(value) : path.basename(value);
    return value;
  }
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeLogDetails(item, key, seen));
  const result = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    result[childKey] = sanitizeLogDetails(childValue, childKey, seen);
  }
  return result;
}

function nowText() {
  return new Date().toISOString();
}

function normalizeError(error) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack, code: error.code };
  }
  return { message: String(error) };
}

async function rotateDesktopLogIfNeeded(logPath) {
  const maxBytes = Math.max(1, Number(process.env.DESKTOP_LOG_MAX_MB || 8)) * 1024 * 1024;
  try {
    const stat = await fs.stat(logPath);
    if (stat.size < maxBytes) return;
    for (let index = 4; index >= 1; index -= 1) {
      const source = `${logPath}.${index}`;
      const target = `${logPath}.${index + 1}`;
      await fs.rm(target, { force: true }).catch(() => {});
      await fs.rename(source, target).catch(() => {});
    }
    await fs.rename(logPath, `${logPath}.1`).catch(() => {});
  } catch {
    // A missing log file does not require rotation.
  }
}

function createDesktopLogger(getUserDataPath) {
  return async function writeLog(level, message, details) {
    const serialized = details === undefined
      ? ''
      : ` ${typeof details === 'string' ? details : JSON.stringify(sanitizeLogDetails(details))}`;
    const line = `[${nowText()}] [${level}] ${message}${serialized}\n`;

    try {
      const folder = path.join(getUserDataPath(), 'logs');
      const logPath = path.join(folder, 'desktop.log');
      await fs.mkdir(folder, { recursive: true });
      await rotateDesktopLogIfNeeded(logPath);
      await fs.appendFile(logPath, line, 'utf8');
    } catch {
      // Logging must never crash the desktop application.
    }

    const method = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
    method(line.trim());
  };
}

module.exports = {
  createDesktopLogger,
  normalizeError,
  sanitizeLogDetails,
  safeUrlForLog,
};
