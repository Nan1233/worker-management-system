const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const backendRoot = path.resolve(__dirname, '..');
const roots = [
  'config',
  'controllers',
  'middleware',
  'models',
  'routes',
  'services',
  'utils',
  'workers'
];
const files = ['server.js'];

const forbiddenPaths = [
  path.join(backendRoot, 'electron'),
  path.join(backendRoot, 'templates.zip'),
  path.resolve(backendRoot, '..', 'desktop', 'git'),
  path.resolve(backendRoot, '..', 'desktop', 'powershell'),
  path.resolve(backendRoot, '..', 'desktop', 'findstr')
];
for (const forbiddenPath of forbiddenPaths) {
  if (fs.existsSync(forbiddenPath)) {
    throw new Error(`Forbidden duplicate or generated source: ${forbiddenPath}`);
  }
}


function collect(relativeDirectory) {
  const absoluteDirectory = path.join(backendRoot, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return;

  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      collect(relativePath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(relativePath);
    }
  }
}

for (const root of roots) collect(root);

for (const file of [...new Set(files)]) {
  execFileSync(process.execPath, ['--check', path.join(backendRoot, file)], {
    stdio: 'inherit'
  });
}

console.log(`Syntax OK: ${new Set(files).size} JavaScript files`);
