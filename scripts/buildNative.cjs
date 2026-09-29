const { spawnSync } = require('node:child_process');

// Test desktop must use the same backend as the TEST web/desktop runtime.
// launcher.cjs also enforces this value at runtime for Electron requests.
const apiUrl = 'https://ktc-be-test.nan978971.workers.dev/api';

const result = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_API_URL: apiUrl },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
