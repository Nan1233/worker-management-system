function clean(value) {
  return String(value ?? '').trim();
}

function validateEnvironment(env = process.env, { production = env.NODE_ENV === 'production' } = {}) {
  if (!production) return { valid: true, missing: [] };

  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];
  if (clean(env.ENABLE_GOOGLE_SHEET_SYNC).toLowerCase() === 'true') {
    required.push('GOOGLE_SERVICE_ACCOUNT', 'GOOGLE_SPREADSHEET_ID');
  }

  const missing = [...new Set(required)].filter((key) => !clean(env[key]));
  if (missing.length) {
    const error = new Error(`Thiếu biến môi trường production: ${missing.join(', ')}`);
    error.code = 'ENVIRONMENT_VALIDATION_FAILED';
    error.missing = missing;
    throw error;
  }

  const jwtSecret = clean(env.JWT_SECRET);
  if (jwtSecret.length < 32) {
    const error = new Error('JWT_SECRET production phải có ít nhất 32 ký tự');
    error.code = 'ENVIRONMENT_VALIDATION_FAILED';
    error.field = 'JWT_SECRET';
    throw error;
  }

  const dbSsl = clean(env.DB_SSL || env.MYSQL_SSL || 'true').toLowerCase();
  if (!['true', '1', 'yes'].includes(dbSsl)) {
    const error = new Error('DB_SSL phải bật trong production để bảo vệ kết nối TiDB');
    error.code = 'ENVIRONMENT_VALIDATION_FAILED';
    error.field = 'DB_SSL';
    throw error;
  }

  const refreshTtlDays = Number(env.REFRESH_TOKEN_TTL_DAYS || 90);
  if (!Number.isFinite(refreshTtlDays) || refreshTtlDays < 1 || refreshTtlDays > 180) {
    const error = new Error('REFRESH_TOKEN_TTL_DAYS production phải nằm trong 1..180 ngày');
    error.code = 'ENVIRONMENT_VALIDATION_FAILED';
    error.field = 'REFRESH_TOKEN_TTL_DAYS';
    throw error;
  }

  return { valid: true, missing: [] };
}

module.exports = { validateEnvironment };
