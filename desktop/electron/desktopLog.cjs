const fs = require('node:fs/promises');
const path = require('node:path');

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
      : ` ${typeof details === 'string' ? details : JSON.stringify(details)}`;
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
};
