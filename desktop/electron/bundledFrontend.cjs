'use strict';

// Serve only the packaged TEST frontend under its existing HTTPS origin.
// The API remains remote and secrets never enter the client distribution.
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8'
});

function bundledFrontendPath(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\\') || decoded.includes('\\0')) return null;
  const relative = decoded.replace(/^\\/+/, '') || 'index.html';
  const rootPath = path.resolve(root);
  const fullPath = path.resolve(rootPath, relative);
  if (!fullPath.startsWith(rootPath + path.sep)) return null;
  return fullPath;
}

async function installBundledFrontend({ session, net, frontendOrigin, root, log = () => {} }) {
  const index = path.join(root, 'index.html');
  await fs.access(index);
  const origin = new URL(frontendOrigin).origin;
  session.defaultSession.protocol.handle('https', async (request) => {
    const remote = () => net.fetch(request, { bypassCustomProtocolHandlers: true });
    let url;
    try { url = new URL(request.url); } catch { return remote(); }
    if (url.origin !== origin || request.method !== 'GET') return remote();
    const file = bundledFrontendPath(root, url.pathname);
    if (!file) return new Response('Not found', { status: 404 });
    // Never serve arbitrary files: only the exact bundled Vite output.
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) return remote();
      const data = await fs.readFile(file);
      return new Response(data, {
        status: 200, headers: {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    } catch (error) {
      if (error.code === 'ENOENT' && !path.extname(url.pathname)) {
        const data = await fs.readFile(index);
        return new Response(data, { status: 200, headers: { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' } });
      }
      log('BUNDLED_FE_ASSET_FALLBACK', { path: url.pathname, code: error.code });
      return remote();
    }
  });
  log('BUNDLED_FE_READY', { root: pathToFileURL(root).href });
}

module.exports = { bundledFrontendPath, installBundledFrontend };
