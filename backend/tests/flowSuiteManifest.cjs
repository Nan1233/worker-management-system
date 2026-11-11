'use strict';

// Explicit allowlist of isolated Node tests. Do not add tests that import
// production DB adapters, call HTTP endpoints, or require live services.
// Route names are based on frontend/src/routes/AppRouter.tsx on branch test.
const FLOW_SUITES = Object.freeze({
  'worker-entry': {
    label: 'Công nhân · nhập báo cáo',
    routes: ['/worker', '/worker/process/select', '/worker/process/:process'],
    tests: [
      'production-submission-queue.test.js',
      'production-daily-hours-calculation.test.js',
      'shared-production-metric-primitives.test.js',
      'f02-submission-contract.test.js'
    ]
  },
  'worker-history': {
    label: 'F03 · lịch sử, chi tiết, chỉnh sửa báo cáo',
    routes: ['/worker/history', '/worker/history/:id', '/worker/history/:id/edit'],
    tests: [
      'f03-worker-history-policy.contract.test.js',
      'worker-report-edit-flow.test.js',
      'temp-edit-regressions.test.js'
    ],
    status: 'PARTIAL_MOCK_COVERAGE'
  },
  'manager-review': {
    label: 'Tổ trưởng / quản lý · chờ duyệt, duyệt, từ chối',
    routes: ['/lead/reports', '/manager/reports', '/manager/report/review', '/manager/approved'],
    tests: [],
    status: 'NEEDS_ISOLATED_TESTS'
  },
  'manager-report': {
    label: 'Quản lý · báo cáo đã duyệt, xem chi tiết và chỉnh sửa',
    routes: ['/manager/approved', '/manager/report/:id', '/manager/report/:id/edit'],
    tests: [],
    status: 'NEEDS_ISOLATED_TESTS'
  },
  'admin-workers': {
    label: 'Admin · quản lý công nhân và phân quyền',
    routes: ['/admin/workers', '/admin/permissions', '/admin/master/:resource'],
    tests: [],
    status: 'NEEDS_ISOLATED_TESTS'
  },
  'cvk-duplicate': {
    label: 'Công việc khác · kiểm tra báo cáo trùng',
    routes: ['/worker/process/non-product', '/worker/process/:process'],
    tests: ['production-cvk-lookup-model.test.js']
  },
  'gc-machine': {
    label: 'Gia công · máy dùng chung, giờ máy, giờ trừ',
    routes: ['/worker/process/:process', '/manager/report/:id'],
    tests: [
      'gc-machine-deduction-hours.test.js',
      'gc-machine-source.test.js'
    ]
  },
  'desktop-excel': {
    label: 'Desktop · chuẩn hóa số và tỷ lệ học việc',
    routes: ['Desktop Electron (không có URL web)'],
    tests: ['shared-production-metric-primitives.test.js']
  },
  'login-security': {
    label: 'F01 · đăng nhập, phiên và phân quyền',
    routes: ['/login', '/worker', '/manager', '/lead', '/admin'],
    tests: [
      'auth-login-controller.behavior.test.js',
      'auth-enumeration-hardening.test.js',
      'auth-duplicate-worker-code.test.js',
      'f01-permission-defaults.contract.test.js'
    ],
    status: 'PARTIAL_BACKEND_MOCK_COVERAGE'
  }
});

module.exports = { FLOW_SUITES };
