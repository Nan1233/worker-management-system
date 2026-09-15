const { spawnSync } = require('node:child_process');

// Native/Desktop builds must use the production Cloudflare Worker backend.
// Do not point the packaged frontend at the retired Render backend.
const apiUrl = 'https://ktc-backend.nan978971.workers.dev/api';

const result = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_API_URL: apiUrl },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
