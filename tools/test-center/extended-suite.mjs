const json = async (response) => {
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const today = () => new Date().toISOString().slice(0,10);

async function api(base, path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  return json(await fetch(`${base}${path}`, { ...options, headers }));
}

function unwrap(body) {
  return Array.isArray(body?.data) ? body.data : body?.data?.items || body?.data || [];
}

async function check(add, id, name, request, ok, detail) {
  try {
    const r = await request();
    const passed = await ok(r);
    add(name, passed ? 'PASS' : 'FAIL', detail(r), id);
  } catch (error) {
    add(name, 'FAIL', error?.message || String(error), id);
  }
}

export async function runExtendedSuite({ apiUrl, managerToken, workerToken, add }) {
  await check(add, 'HEALTH-001', 'API liveness', () => api(apiUrl, '/api/health/live'), r => r.response.ok && r.body?.success === true, r => `HTTP ${r.response.status}`);
  await check(add, 'HEALTH-002', 'API readiness', () => api(apiUrl, '/api/health/ready'), r => r.response.ok || r.response.status === 503, r => `HTTP ${r.response.status}${r.body?.schemaStatus ? ` | schema=${r.body.schemaStatus}` : ''}`);
  await check(add, 'VERSION-001', 'Backend version endpoint', () => api(apiUrl, '/api/version'), r => r.response.status < 500, r => `HTTP ${r.response.status}`);
  await check(add, 'MASTER-003', 'Process options', () => api(apiUrl, '/api/users/options/processes', { headers: auth(managerToken) }), r => r.response.ok && unwrap(r.body).length > 0, r => `HTTP ${r.response.status} | count=${unwrap(r.body).length}`);

  const processContext = await api(apiUrl, '/api/users/options/processes', { headers: auth(workerToken) });
  const firstProcess = unwrap(processContext.body).find(x => Number(x?.id) > 0);
  const processId = Number(firstProcess?.id || 0);

  await check(add, 'MASTER-004', 'Machines master API', () => {
    if (!processId) throw new Error(`Không có process_id để kiểm tra machines master | HTTP ${processContext.response.status}`);
    return api(apiUrl, `/api/machines?process_id=${processId}`, { headers: auth(workerToken) });
  }, r => r.response.ok && Array.isArray(unwrap(r.body)), r => `HTTP ${r.response.status} | process=${processId} | count=${unwrap(r.body).length}`);

  await check(add, 'MASTER-005', 'Product standards master API', () => {
    if (!processId) throw new Error(`Không có process_id để kiểm tra product standards master | HTTP ${processContext.response.status}`);
    return api(apiUrl, `/api/product-standards?process_id=${processId}`, { headers: auth(workerToken) });
  }, r => r.response.ok && Array.isArray(unwrap(r.body)), r => `HTTP ${r.response.status} | process=${processId} | count=${unwrap(r.body).length}`);

  await check(add, 'DEFECT-001', 'Defect master endpoint', async () => {
    if (!processId) throw new Error(`Không có process để kiểm tra defect master | HTTP ${processContext.response.status}`);
    const r = await api(apiUrl, `/api/processes/${processId}/defects`, { headers: auth(workerToken) });
    return { r, processId };
  }, x => x.r.response.ok && Array.isArray(unwrap(x.r.body)), x => `HTTP ${x.r.response.status} | process=${x.processId}`);

  await check(add, 'WORKER-004', 'Worker report list API', () => api(apiUrl, '/api/production-temp/my', { headers: auth(workerToken) }), r => r.response.ok && r.body?.success !== false, r => `HTTP ${r.response.status} | rows=${unwrap(r.body).length}`);
  await check(add, 'WORKER-005', 'Worker daily hours API', () => api(apiUrl, `/api/production-temp/daily-hours?date=${today()}`, { headers: auth(workerToken) }), r => r.response.ok && Number(r.body?.data?.limit_hours) === 12, r => `HTTP ${r.response.status} | counted=${r.body?.data?.counted_hours ?? '-'}h | limit=${r.body?.data?.limit_hours ?? '-'}`);
  await check(add, 'WORKER-006', 'Worker similar-report check endpoint', async () => {
    if (!processId) throw new Error(`Không có process để kiểm tra similar report | HTTP ${processContext.response.status}`);
    return api(apiUrl, '/api/production-temp/check-similar', { method:'POST', headers:auth(workerToken), body:JSON.stringify({ process_id:processId, work_date:today(), shift:'TEST', machine_no:'TEST', product_name:'TEST' }) });
  }, r => r.response.status < 500, r => `HTTP ${r.response.status} | ${r.body?.message || 'endpoint reachable'}`);

  await check(add, 'MANAGER-002', 'Manager pending reports', () => api(apiUrl, '/api/production-temp/pending', { headers: auth(managerToken) }), r => r.response.ok && r.body?.success !== false, r => `HTTP ${r.response.status} | rows=${unwrap(r.body).length}`);
  await check(add, 'MANAGER-003', 'Manager approved reports', () => api(apiUrl, '/api/production-temp/approved', { headers: auth(managerToken) }), r => r.response.ok && r.body?.success !== false, r => `HTTP ${r.response.status} | rows=${unwrap(r.body).length}`);
  await check(add, 'MANAGER-004', 'Manager report dates', () => api(apiUrl, '/api/production-temp/dates', { headers: auth(managerToken) }), r => r.response.ok && r.body?.success !== false, r => `HTTP ${r.response.status} | rows=${unwrap(r.body).length}`);
  await check(add, 'MANAGER-005', 'Manager report list', () => api(apiUrl, '/api/manager/reports', { headers: auth(managerToken) }), r => r.response.ok && r.body?.success !== false, r => `HTTP ${r.response.status} | rows=${unwrap(r.body).length}`);

  const from = today();
  const to = today();
  await check(add, 'MANAGER-006', 'Dashboard summary', () => api(apiUrl, `/api/dashboard/summary?from=${from}&to=${to}`, { headers: auth(managerToken) }), r => r.response.ok && r.body?.success !== false, r => `HTTP ${r.response.status} | from=${from} | to=${to}`);

  await check(add, 'USER-001', 'Manager user list', () => api(apiUrl, '/api/users', { headers: auth(managerToken) }), r => r.response.ok && r.body?.success !== false, r => `HTTP ${r.response.status} | users=${unwrap(r.body).length}`);
  await check(add, 'USER-002', 'User process options', () => api(apiUrl, '/api/users/options/processes', { headers: auth(managerToken) }), r => r.response.ok && unwrap(r.body).length > 0, r => `HTTP ${r.response.status} | processes=${unwrap(r.body).length}`);
  await check(add, 'NOTIFY-001', 'Notification unread count', () => api(apiUrl, '/api/system/notifications/unread-count', { headers: auth(managerToken) }), r => r.response.ok && r.body?.success !== false, r => `HTTP ${r.response.status}`);
  await check(add, 'NOTIFY-002', 'Notification list', () => api(apiUrl, '/api/system/notifications', { headers: auth(managerToken) }), r => r.response.ok && r.body?.success !== false, r => `HTTP ${r.response.status} | rows=${unwrap(r.body).length}`);
  await check(add, 'SYSTEM-001', 'System observability', () => api(apiUrl, '/api/system/observability', { headers: auth(managerToken) }), r => r.response.ok && r.body?.success !== false, r => `HTTP ${r.response.status}`);
  await check(add, 'SYSTEM-002', 'System activity audit', () => api(apiUrl, '/api/system/activities', { headers: auth(managerToken) }), r => r.response.ok && r.body?.success !== false, r => `HTTP ${r.response.status} | rows=${unwrap(r.body).length}`);
  await check(add, 'EXPORT-002', 'Excel export capability status', () => api(apiUrl, '/api/reports/export-excel/company-status', { headers: auth(managerToken) }), r => r.response.ok && r.body?.success === true, r => `HTTP ${r.response.status} | mode=${r.body?.mode || '-'}`);
  await check(add, 'EXPORT-003', 'Excel company data endpoint', () => api(apiUrl, '/api/reports/export-excel/company-data?date=' + today(), { headers: auth(managerToken) }), r => r.response.status < 500 && r.response.status !== 404, r => `HTTP ${r.response.status}`);
  await check(add, 'EXPORT-004', 'Excel process list endpoint', () => api(apiUrl, '/api/reports/export-excel/processes', { headers: auth(managerToken) }), r => r.response.status < 500 && r.response.status !== 404, r => `HTTP ${r.response.status} | rows=${unwrap(r.body).length}`);

  await check(add, 'PERM-002', 'Worker cannot access dashboard', () => api(apiUrl, `/api/dashboard/summary?from=${from}&to=${to}`, { headers: auth(workerToken) }), r => r.response.status === 403, r => `Worker dashboard: HTTP ${r.response.status}`);
  await check(add, 'PERM-003', 'Worker cannot access manager report list', () => api(apiUrl, '/api/manager/reports', { headers: auth(workerToken) }), r => r.response.status === 403, r => `Worker manager reports: HTTP ${r.response.status}`);
}
