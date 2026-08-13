require('dotenv').config();
const { spawn } = require('node:child_process');
const path = require('node:path');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

function runNode(script, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: path.resolve(__dirname, '..'),
      env,
      stdio: 'inherit'
    });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(script)} exit ${code}`)));
  });
}

async function main() {
  const file = path.resolve(arg('--file') || '');
  if (!arg('--file')) throw new Error('Cách dùng: npm run restore:rehearsal -- --file <backup>');

  const production = {
    host: required('DB_HOST'),
    port: String(process.env.DB_PORT || '4000'),
    name: required('DB_NAME')
  };
  const rehearsal = {
    host: required('KTC_RESTORE_DB_HOST'),
    port: String(process.env.KTC_RESTORE_DB_PORT || process.env.DB_PORT || '4000'),
    user: required('KTC_RESTORE_DB_USER'),
    password: required('KTC_RESTORE_DB_PASSWORD'),
    name: required('KTC_RESTORE_DB_NAME'),
    ssl: String(process.env.KTC_RESTORE_DB_SSL || process.env.DB_SSL || 'true')
  };

  if (production.host === rehearsal.host && production.port === rehearsal.port && production.name === rehearsal.name) {
    throw new Error('RESTORE REHEARSAL bị chặn: DB đích trùng DB production. Hãy dùng database staging riêng.');
  }
  if (!/staging|restore|rehearsal|test|drill/i.test(rehearsal.name) && process.env.KTC_ALLOW_NON_TEST_RESTORE_DB !== 'true') {
    throw new Error('Tên DB rehearsal phải chứa staging/restore/rehearsal/test/drill. Chỉ override bằng KTC_ALLOW_NON_TEST_RESTORE_DB=true khi đã kiểm tra kỹ.');
  }

  const env = {
    ...process.env,
    DB_HOST: rehearsal.host,
    DB_PORT: rehearsal.port,
    DB_USER: rehearsal.user,
    DB_PASSWORD: rehearsal.password,
    DB_NAME: rehearsal.name,
    DB_SSL: rehearsal.ssl,
    DB_CONNECTION_LIMIT: '3'
  };

  console.log(`[KTC] Restore rehearsal target: ${rehearsal.host}:${rehearsal.port}/${rehearsal.name}`);
  const targetName = `${rehearsal.name}_restore_${Date.now()}`.replace(/[^A-Za-z0-9_]/g, '_');
  const restoreEnv = {
    ...process.env,
    KTC_RESTORE_DB_HOST: rehearsal.host,
    KTC_RESTORE_DB_PORT: rehearsal.port,
    KTC_RESTORE_DB_USER: rehearsal.user,
    KTC_RESTORE_DB_PASSWORD: rehearsal.password,
    KTC_RESTORE_DB_SSL: rehearsal.ssl,
    KTC_RESTORE_TARGET_DB: targetName,
    KTC_RESTORE_ENV_CLASS: 'STAGING'
  };
  await runNode(path.join(__dirname, 'restoreDatabaseBackup.js'), ['--file', file, '--target-db', targetName, '--env-class', 'STAGING', '--confirm', 'KTC_DISASTER_RESTORE_STAGE'], restoreEnv);
  console.log(`[KTC] Restore rehearsal PASS: staged restore verified at ${rehearsal.host}:${rehearsal.port}/${targetName}; no cutover performed.`);
}

main().catch((error) => {
  console.error('[KTC] Restore rehearsal failed:', error.message);
  process.exitCode = 1;
});
