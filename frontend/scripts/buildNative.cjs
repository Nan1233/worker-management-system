const { spawnSync } = require('node:child_process');

const defaultNativeApiUrl = 'https://worker-management-system-2-5jqv.onrender.com/api';
const apiUrl = String(process.env.VITE_API_URL || process.env.KTC_API_URL || defaultNativeApiUrl)
  .trim()
  .replace(/\/+$/, '');
if (!/^https:\/\//i.test(apiUrl) || !/\/api$/i.test(apiUrl)) {
  console.error('[KTC] Native production build requires the full HTTPS API base URL ending in /api.');
  process.exit(1);
}

const result = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_API_URL: apiUrl },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
