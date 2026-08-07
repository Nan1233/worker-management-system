const { spawn } = require('child_process');
const path = require('path');

const isRender = process.env.RENDER === 'true' || Boolean(process.env.RENDER_SERVICE_ID);

if (isRender) {
  const backendDir = path.resolve(__dirname, '..', 'backend');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: backendDir,
    stdio: 'inherit',
    env: process.env
  });
  child.on('exit', code => process.exit(code || 0));
} else {
  const child = spawn('npm.cmd', ['run', 'start:desktop'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env
  });
  child.on('exit', code => process.exit(code || 0));
}
