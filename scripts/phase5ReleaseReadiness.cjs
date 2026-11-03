#!/usr/bin/env node
'use strict';

// Source-only Phase 5 release readiness report.
// This script never connects to services, reads secrets, queries a database,
// builds artifacts, publishes releases, or deploys anything.

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => {
  try { return fs.readFileSync(path.join(root, file), 'utf8'); }
  catch { return ''; }
};
const json = (file) => {
  try { return JSON.parse(read(file)); }
  catch { return {}; }
};

const blockers = [];
const warnings = [];
const checks = [];
const add = (target, id, message, evidence) => target.push({ id, message, evidence });

const desktopLauncher = read('desktop/electron/launcher.cjs');
const frontendRender = read('frontend/render.yaml');
const rootRender = read('render.yaml');
const backendServer = read('backend/server.js');
const backendRender = read('backend/render.yaml');
const desktopPackage = json('desktop/package.json');
const backendPackage = json('backend/package.json');
const frontendPackage = json('frontend/package.json');
const rootPackage = json('package.json');
const updater = read('desktop/electron/autoUpdate.cjs');

const hasTestDesktopApi = /ktc-be-test\.nan978971\.workers\.dev\/api/i.test(desktopLauncher);
const hasTestDesktopWeb = /ktc-fe-test\.nan978971\.workers\.dev/i.test(desktopLauncher);
if (hasTestDesktopApi || hasTestDesktopWeb) {
  add(blockers, 'DESKTOP_TEST_ENDPOINTS', 'Desktop launcher đang ghim URL TEST; không được đóng gói/phát hành như bản production.', [
    hasTestDesktopApi ? 'desktop/electron/launcher.cjs: KTC_API_URL -> ktc-be-test.nan978971.workers.dev/api' : null,
    hasTestDesktopWeb ? 'desktop/electron/launcher.cjs: TEST_FRONTEND_URL -> ktc-fe-test.nan978971.workers.dev' : null
  ].filter(Boolean));
} else checks.push({ id: 'DESKTOP_TEST_ENDPOINTS', status: 'PASS' });

if (/ktc-be-test\.nan978971\.workers\.dev/i.test(frontendRender)) {
  add(blockers, 'FRONTEND_RENDER_TEST_API', 'frontend/render.yaml đang trỏ API về Worker TEST; cần xác định API production chính thức trước khi phát hành.', 'frontend/render.yaml: VITE_API_URL');
}
if (/ktc-frontend/.test(rootRender) && /worker-management-system-2-5jqv\.onrender\.com\/api/.test(rootRender)
    && /ktc-be-test\.nan978971\.workers\.dev\/api/.test(frontendRender)) {
  add(blockers, 'DEPLOYMENT_MANIFEST_DRIFT', 'Hai Render manifest mô tả hai topology khác nhau (Render backend ở root, Worker TEST trong frontend/render.yaml). Chưa có một cấu hình production duy nhất được xác nhận.', [
    'render.yaml: ktc-frontend + worker-management-system-2-5jqv.onrender.com/api',
    'frontend/render.yaml: ktc-be-test.nan978971.workers.dev/api'
  ]);
}

const renderOrigin = 'https://ktc-frontend.onrender.com';
const serverHasOrigin = backendServer.includes(renderOrigin);
const rootHasCors = /key:\s*CORS_ORIGINS/.test(rootRender);
if (!serverHasOrigin && !rootHasCors) {
  add(blockers, 'CORS_PRODUCTION_ORIGIN_UNVERIFIED', 'CORS origin cho frontend Render không được khai báo rõ trong cấu hình version-controlled. Cần xác nhận CORS_ORIGINS tại môi trường triển khai trước release.', [
    'backend/server.js: allowlist mặc định có worker-management-system-3-dzox.onrender.com',
    'render.yaml: không khai báo CORS_ORIGINS'
  ]);
}

const versions = {
  root: rootPackage.version || null,
  frontend: frontendPackage.version || null,
  backend: backendPackage.version || null,
  desktop: desktopPackage.version || null
};
const distinctVersions = [...new Set(Object.values(versions).filter(Boolean))];
if (distinctVersions.length > 1) {
  add(warnings, 'COMPONENT_VERSION_MATRIX', 'Các package có version độc lập; cần chốt version matrix và ghi rõ phiên bản FE/BE/Desktop trong release notes.', versions);
}

if (/autoDeploy:\s*true/.test(backendRender) && /preDeployCommand:.*db:schema:verify/.test(backendRender)) {
  add(warnings, 'ALTERNATE_RENDER_BLUEPRINT', 'backend/render.yaml bật autoDeploy và chạy schema verification ở pre-deploy. Không chọn blueprint này khi chưa duyệt riêng tác động pre-deploy.', 'backend/render.yaml');
}

const windowsSigningDisabled = desktopPackage.build?.win?.signAndEditExecutable === false;
if (windowsSigningDisabled) {
  add(warnings, 'WINDOWS_CODE_SIGNING', 'Windows executable hiện cấu hình signAndEditExecutable=false; cần quyết định ký số và kiểm tra chứng thư trước khi phát hành rộng.', 'desktop/package.json: build.win.signAndEditExecutable=false');
}
const githubUpdaterConfigured = Boolean(desktopPackage.build?.publish?.some((item) => item.provider === 'github'));
if (githubUpdaterConfigured && /autoUpdater\.checkForUpdates\(\)/.test(updater)) {
  add(warnings, 'GITHUB_AUTO_UPDATE_RELEASE', 'Electron tự kiểm tra GitHub Releases; cần quy trình phát hành có latest.yml/blockmap, artifact đúng version và thử cập nhật trên máy test.', 'desktop/package.json build.publish + desktop/electron/autoUpdate.cjs');
}

const releaseWorkflowDir = path.join(root, '.github', 'workflows');
let hasReleaseWorkflow = false;
try {
  hasReleaseWorkflow = fs.readdirSync(releaseWorkflowDir).some((name) => /release|publish|deploy/i.test(name));
} catch {}
if (!hasReleaseWorkflow) {
  add(warnings, 'RELEASE_PIPELINE', 'Chưa tìm thấy workflow chuyên biệt cho release/publish; hiện các workflow CI không tự chứng minh artifact đã được đóng gói và ký số.', '.github/workflows');
}

const report = {
  project: 'KTC Worker Management System',
  branchIntent: 'test',
  mode: 'source-only; no database/network/deploy/build/publish',
  releaseStatus: blockers.length ? 'BLOCKED' : 'READY_FOR_MANUAL_APPROVAL',
  blockers,
  warnings,
  checks,
  componentVersions: versions,
  nextActions: [
    'Chọn một topology production duy nhất và API URL chính thức.',
    'Tách cấu hình TEST/PRODUCTION Desktop bằng cấu hình build rõ ràng; không hardcode TEST trong launcher phát hành.',
    'Xác nhận CORS_ORIGINS tại Render theo domain frontend thực tế.',
    'Chốt version matrix, ký số Windows và quy trình GitHub Release/auto-update.',
    'Chạy smoke test read-only trên staging đã được cho phép; không dùng production write-path.'
  ]
};

console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--strict') && blockers.length) process.exitCode = 1;
