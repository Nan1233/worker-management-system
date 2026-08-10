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

  return { valid: true, missing: [] };
}

module.exports = { validateEnvironment };
