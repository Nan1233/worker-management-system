'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  isTrustedRendererNavigation,
  isSafeExternalUrl,
  isRetrySafeMethod,
  assertImportFileSize,
  ReportImportPreviewGuard,
} = require('../electron/securityPolicy.cjs');

test('renderer navigation is limited to explicitly trusted packaged files', () => {
  const frontend = path.resolve('/app/frontend/dist/index.html');
  const offline = path.resolve('/app/assets/offline.html');
  const toFileUrl = (p) => `file://${p}`;
  assert.equal(isTrustedRendererNavigation(toFileUrl(frontend), [frontend, offline]), true);
  assert.equal(isTrustedRendererNavigation(`${toFileUrl(frontend)}#/worker`, [frontend, offline]), true);
  assert.equal(isTrustedRendererNavigation('data:text/html,<script>alert(1)</script>', [frontend, offline]), false);
  assert.equal(isTrustedRendererNavigation('about:blank', [frontend, offline]), false);
  assert.equal(isTrustedRendererNavigation('file:///etc/passwd', [frontend, offline]), false);
});

test('only http/https schemes may be opened externally', () => {
  assert.equal(isSafeExternalUrl('https://example.com'), true);
  assert.equal(isSafeExternalUrl('http://example.com'), true);
  assert.equal(isSafeExternalUrl('file:///tmp/a'), false);
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
  assert.equal(isSafeExternalUrl('data:text/html,x'), false);
});

test('automatic retry is disabled for mutation methods', () => {
  assert.equal(isRetrySafeMethod('GET'), true);
  assert.equal(isRetrySafeMethod('HEAD'), true);
  assert.equal(isRetrySafeMethod('POST'), false);
  assert.equal(isRetrySafeMethod('PUT'), false);
  assert.equal(isRetrySafeMethod('PATCH'), false);
  assert.equal(isRetrySafeMethod('DELETE'), false);
});

test('report import apply is bound to the native-previewed file and expires', () => {
  let now = 1_000;
  const guard = new ReportImportPreviewGuard({ ttlMs: 100, now: () => now });
  const selected = path.resolve('/tmp/selected.xlsx');
  guard.remember(selected);
  assert.equal(guard.assertAllowed(selected), selected);
  assert.throws(() => guard.assertAllowed('/tmp/other.xlsx'), { code: 'KTC_IMPORT_FILE_MISMATCH' });
  now += 101;
  assert.throws(() => guard.assertAllowed(selected), { code: 'KTC_IMPORT_PREVIEW_EXPIRED' });
});

test('oversized Excel import is rejected before parsing', () => {
  assert.equal(assertImportFileSize(1024, 2048), 1024);
  assert.throws(() => assertImportFileSize(4096, 2048), { code: 'KTC_IMPORT_FILE_TOO_LARGE' });
});
