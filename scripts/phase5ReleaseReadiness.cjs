#!/usr/bin/env node
'use strict';

// Source-only Phase 5 release readiness report.
// Never connects to Cloudflare, TiDB, Render, reads live secrets, builds, publishes or deploys.

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => {
  try { return fs.readFileSync(path.join(root, file), 'utf8'); }
  catch { return ''; }
};
const { parseJsonc } = require('./lib/jsonc.cjs');
// wrangler*.jsonc files may contain comments; parse them as JSONC, not strict JSON.
const json = (file) => {
  try { return parseJsonc(read(file)); }
  catch { return {}; }
};
const envValue = (file, key) => {
  const match = read(file).match(new RegExp('^\\s*' + key + '\\s*=\\s*(.*?)\\s*$', 'm'));
  return match ? match[1].replace(/^["']|["']$/g, '') : '';
};
const blockers = [];
const warnings = [];
const checks = [];
const add = (target, id, message, evidence) => target.push({ id, message, evidence });

const backendTest = json('backend/wrangler.jsonc');
const backendProduction = json('backend/wrangler.production.jsonc');
const frontendTest = json('frontend/wrangler.jsonc');
const frontendProduction = json('frontend/wrangler.production.jsonc');
const desktopPackage = json('desktop/package.json');
const desktopProductionBuilder = json('desktop/electron-builder.production.json');
const backendPackage = json('backend/package.json');
const frontendPackage = json('frontend/package.json');
const rootPackage = json('package.json');
const desktopLauncher = read('desktop/electron/launcher.cjs');
const desktopProfileSource = read('desktop/electron/deploymentProfile.cjs');
const cloudflareWorker = read('backend/cloudflare-worker.js');
const frontendEnvSource = read('frontend/src/config/env.ts');
const updater = read('desktop/electron/autoUpdate.cjs');

let testBackendProfile = null;
let productionBackendProfile = null;
let profileError = null;
try {
  const profile = require('../backend/config/cloudflareDeploymentProfile.cjs');
  testBackendProfile = profile.resolveCloudflareDeploymentProfile(backendTest.vars || {});
  productionBackendProfile = profile.resolveCloudflareDeploymentProfile(backendProduction.vars || {});
} catch (error) {
  profileError = error.message;
}

const expectedTestApi = 'https://ktc-be-test.nan978971.workers.dev/api';
const expectedProductionApi = 'https://ktc-backend.nan978971.workers.dev/api';
const testFrontendApi = envValue('frontend/.env.test', 'VITE_API_URL');
const productionFrontendApi = envValue('frontend/.env.production', 'VITE_API_URL');
const testProfileOk = Boolean(
  backendTest.name === 'ktc-be-test' &&
  backendTest.vars?.KTC_ENVIRONMENT === 'test' &&
  backendTest.vars?.KTC_FRONTEND_ORIGIN === 'https://ktc-fe-test.nan978971.workers.dev' &&
  frontendTest.name === 'ktc-fe-test' &&
  testFrontendApi === expectedTestApi &&
  frontendPackage.scripts?.['build:cloudflare']?.includes('--mode test') &&
  frontendPackage.scripts?.['build:cloudflare:test']?.includes('--mode test') &&
  desktopPackage.ktcDeploymentEnvironment === 'test' &&
  desktopPackage.scripts?.['dist:win:test']?.includes('--publish never') &&
  /ktc-be-test\.nan978971\.workers\.dev/.test(desktopProfileSource) &&
  /ktc-fe-test\.nan978971\.workers\.dev/.test(desktopProfileSource) &&
  testBackendProfile?.environment === 'test'
);
const productionProfileOk = Boolean(
  backendProduction.name === 'ktc-backend' &&
  backendProduction.vars?.KTC_ENVIRONMENT === 'production' &&
  backendProduction.vars?.KTC_FRONTEND_ORIGIN === 'https://ktc-frontend.nan978971.workers.dev' &&
  backendProduction.vars?.KTC_RUN_MASTER_DATA_BOOTSTRAP === 'false' &&
  frontendProduction.name === 'ktc-frontend' &&
  productionFrontendApi === expectedProductionApi &&
  frontendPackage.scripts?.['build:cloudflare:production']?.includes('--mode production') &&
  desktopProductionBuilder.extraMetadata?.ktcDeploymentEnvironment === 'production' &&
  desktopPackage.scripts?.['dist:win:production']?.includes('electron-builder.production.json') &&
  /ktc-backend\.nan978971\.workers\.dev/.test(desktopProfileSource) &&
  /ktc-frontend\.nan978971\.workers\.dev/.test(desktopProfileSource) &&
  productionBackendProfile?.environment === 'production'
);

if (!testProfileOk || !productionProfileOk || profileError) {
  add(blockers, 'CLOUDFLARE_PROFILE_CONFIGURATION', 'Cấu hình Cloudflare TEST/production chưa đồng bộ hoặc không vượt qua kiểm tra profile tĩnh.', {
    testProfileOk,
    productionProfileOk,
    profileError,
    testFrontendApi,
    productionFrontendApi
  });
} else {
  checks.push({ id: 'CLOUDFLARE_PROFILE_CONFIGURATION', status: 'PASS' });
}

if (testProfileOk) {
  checks.push({ id: 'TEST_ENVIRONMENT_ISOLATION', status: 'PASS' });
} else {
  add(blockers, 'TEST_ENVIRONMENT_ISOLATION', 'Không chứng minh được TEST FE/BE/Desktop cùng trỏ về tài nguyên TEST.', null);
}
if (productionProfileOk) {
  checks.push({ id: 'PRODUCTION_ENVIRONMENT_PROFILE', status: 'PASS' });
} else {
  add(blockers, 'PRODUCTION_ENVIRONMENT_PROFILE', 'Thiếu profile Cloudflare production rõ ràng cho FE, BE hoặc Desktop.', null);
}

// Cloudflare secret values intentionally do not belong in Git. Their presence in the
// Cloudflare account cannot be verified by this source-only gate.
add(blockers, 'CLOUDFLARE_RUNTIME_SECRETS_UNVERIFIED', 'Chưa thể xác minh trong tài khoản Cloudflare rằng TIDB_DATABASE_URL (hoặc DB_*), JWT_SECRET và các secret tích hợp đã được cấu hình cho cả Worker TEST và production. Cần xác minh thủ công trước khi phát hành.', [
  'backend/cloudflare-worker.js validates runtime TiDB connection material and JWT_SECRET',
  'wrangler configs intentionally contain no secret values'
]);

if (/resolveCloudflareDeploymentProfile/.test(cloudflareWorker) &&
    /validateCloudflareRuntimeSecrets\(env\)/.test(cloudflareWorker) &&
    !/ensureCloudflareSeeded|ensureGcDefectMasterData|ensureGcLong2801Lt/.test(cloudflareWorker) &&
    backendTest.vars?.KTC_RUN_MASTER_DATA_BOOTSTRAP === 'false' &&
    backendProduction.vars?.KTC_RUN_MASTER_DATA_BOOTSTRAP === 'false') {
  checks.push({ id: 'CLOUDFLARE_RUNTIME_GUARDS', status: 'PASS' });
} else {
  add(blockers, 'CLOUDFLARE_RUNTIME_GUARDS', 'Thiếu guard profile/CORS/secret hoặc tắt master-data bootstrap mặc định ở Cloudflare Worker.', null);
}

if (/const cloudflareFrontendOrigin\s*=|const cloudflareTestFrontendOrigin\s*=/.test(cloudflareWorker) ||
    !/testApiOrigin/.test(frontendEnvSource) ||
    !/isProductionBuild/.test(frontendEnvSource) ||
    !/productionFrontendHostname/.test(frontendEnvSource)) {
  add(blockers, 'CROSS_ENVIRONMENT_ENDPOINT_GUARD', 'Frontend hoặc Worker còn endpoint hardcode dùng chung giữa TEST và production, hoặc thiếu guard build fail-closed.', null);
} else {
  checks.push({ id: 'CROSS_ENVIRONMENT_ENDPOINT_GUARD', status: 'PASS' });
}

const renderFiles = ['render.yaml', 'frontend/render.yaml', 'backend/render.yaml'].filter((file) => fs.existsSync(path.join(root, file)));
if (renderFiles.length) {
  add(warnings, 'LEGACY_RENDER_BLUEPRINTS', 'Các Render blueprint cũ vẫn còn trong repository. Chúng không thuộc kiến trúc Cloudflare đã chọn; không được dùng để tạo/cập nhật production service.', renderFiles);
}

const hasTestDesktopApi = desktopPackage.ktcDeploymentEnvironment === 'test' && /ktc-be-test/.test(desktopProfileSource);
const hasTestDesktopWeb = desktopPackage.ktcDeploymentEnvironment === 'test' && /ktc-fe-test/.test(desktopProfileSource);
if (hasTestDesktopApi || hasTestDesktopWeb) {
  add(warnings, 'DESKTOP_DEFAULT_TEST_PROFILE', 'Launcher mặc định TEST theo metadata của package trên nhánh test; chỉ dùng electron-builder.production.json cho artifact production.', [
    'desktop/package.json: ktcDeploymentEnvironment=test',
    'desktop/electron-builder.production.json: ktcDeploymentEnvironment=production'
  ]);
}

const versions = {
  root: rootPackage.version || null,
  frontend: frontendPackage.version || null,
  backend: backendPackage.version || null,
  desktop: desktopPackage.version || null
};
if (new Set(Object.values(versions).filter(Boolean)).size > 1) {
  add(warnings, 'COMPONENT_VERSION_MATRIX', 'Các package có version độc lập; release notes cần ghi rõ version FE/BE/Desktop và commit SHA.', versions);
}

const windowsSigningDisabled = desktopPackage.build?.win?.signAndEditExecutable === false;
if (windowsSigningDisabled) {
  add(warnings, 'WINDOWS_CODE_SIGNING', 'Windows executable hiện cấu hình signAndEditExecutable=false; cần quyết định ký số trước khi phân phối rộng.', 'desktop/package.json: build.win.signAndEditExecutable=false');
}
const githubUpdaterConfigured = Boolean(desktopPackage.build?.publish?.some((item) => item.provider === 'github'));
if (githubUpdaterConfigured && /autoUpdater\.checkForUpdates\(\)/.test(updater)) {
  add(warnings, 'GITHUB_AUTO_UPDATE_RELEASE', 'Electron auto-update dùng GitHub Releases; cần xác minh artifact, latest.yml/blockmap và rollback trên máy TEST trước khi bật phân phối.', 'desktop/package.json + desktop/electron/autoUpdate.cjs');
}

const workflowDir = path.join(root, '.github', 'workflows');
let hasArtifactReleaseWorkflow = false;
try {
  hasArtifactReleaseWorkflow = fs.readdirSync(workflowDir).some((name) =>
    /release|publish/i.test(name) && !/phase5-release-readiness/i.test(name)
  );
} catch {}
if (!hasArtifactReleaseWorkflow) {
  add(warnings, 'RELEASE_ARTIFACT_PIPELINE', 'Chưa có workflow chuyên biệt tạo và đính kèm artifact production cho Cloudflare/Windows Desktop; Phase 5 gate hiện chỉ kiểm tra source.', '.github/workflows');
}

const report = {
  project: 'KTC Worker Management System',
  branchIntent: 'test',
  targetArchitecture: 'Cloudflare Workers + Cloudflare Workers Static Assets + TiDB Cloud',
  mode: 'source-only; no database/network/deploy/build/publish',
  branchStatus: 'TEST_BRANCH_SOURCE_CHECKS',
  testProfileStatus: testProfileOk ? 'EXPLICIT_TEST_ENDPOINTS' : 'TEST_PROFILE_INVALID',
  productionProfileStatus: productionProfileOk ? 'EXPLICIT_CLOUDFLARE_PROFILES' : 'PRODUCTION_PROFILE_INVALID',
  releaseStatus: blockers.length ? 'BLOCKED' : 'READY_FOR_MANUAL_APPROVAL',
  blockers,
  warnings,
  checks,
  componentVersions: versions,
  nextActions: [
    'Cấu hình TIDB_DATABASE_URL (hoặc DB_*), JWT_SECRET và secrets cần thiết bằng Cloudflare secret storage cho từng Worker environment; không commit secret.',
    'Xác minh tên Worker/domain production đã được tạo trong Cloudflare trước khi build/phát hành.',
    'Giữ Render blueprints ngoài quy trình production; chỉ dùng wrangler.production.jsonc và frontend/wrangler.production.jsonc cho production.',
    'Chạy CI source/unit tests; staging runtime smoke test cần được cho phép riêng.',
    'Chốt version matrix, ký số Windows và quy trình GitHub Release/auto-update.'
  ]
};

console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--strict') && blockers.length) process.exitCode = 1;
