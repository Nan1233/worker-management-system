const { spawnSync } = require('node:child_process');

const apiUrl = 'https://worker-management-system-2-5jqv.onrender.com/api';

const result = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_API_URL: apiUrl },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
