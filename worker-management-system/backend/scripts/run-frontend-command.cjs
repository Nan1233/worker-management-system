const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const desktopRoot = path.resolve(__dirname, '..');
const candidates = [
  path.resolve(desktopRoot, '..', 'frontend'),
  path.join(desktopRoot, 'frontend'),
];

const frontendRoot = candidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'package.json')),
);

if (!frontendRoot) {
  console.error('[KTC] Không tìm thấy frontend/package.json.');
  console.error('[KTC] Cần đặt frontend cạnh desktop hoặc trong desktop/frontend.');
  process.exit(1);
}

const command = process.argv[2];
if (!['install', 'build'].includes(command)) {
  console.error('[KTC] Lệnh hợp lệ: install hoặc build.');
  process.exit(1);
}

const npmArgs = command === 'install' ? ['install'] : ['run', 'build'];
console.log(`[KTC] Frontend: ${frontendRoot}`);
console.log(`[KTC] Chạy: npm ${npmArgs.join(' ')}`);

const result = spawnSync('npm', npmArgs, {
  cwd: frontendRoot,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error('[KTC] Không thể chạy npm cho frontend:', result.error);
  process.exit(1);
}

if (result.signal) {
  console.error(`[KTC] Tiến trình frontend bị dừng bởi signal ${result.signal}.`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[KTC] Lệnh frontend thất bại, exit code: ${result.status}.`);
  process.exit(result.status || 1);
}

if (command === 'build') {
  const sourceDist = path.join(frontendRoot, 'dist');
  if (!fs.existsSync(path.join(sourceDist, 'index.html'))) {
    console.error('[KTC] Build báo thành công nhưng không tìm thấy dist/index.html.');
    process.exit(1);
  }

  const bundledFrontend = path.join(desktopRoot, 'frontend');
  const bundledDist = path.join(bundledFrontend, 'dist');

  fs.rmSync(bundledFrontend, { recursive: true, force: true });
  fs.mkdirSync(bundledFrontend, { recursive: true });
  fs.cpSync(sourceDist, bundledDist, { recursive: true });

  console.log(`[KTC] Đã sao chép frontend build vào: ${bundledDist}`);
}

process.exit(0);
