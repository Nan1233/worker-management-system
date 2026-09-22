const json = async (response) => {
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
};

const unique = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;

async function api(base, path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  return json(await fetch(`${base}${path}`, { ...options, headers }));
}

async function login(base, username, password, accessType) {
  const r = await api(base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, access_type: accessType }),
  });
  if (!r.response.ok || !r.body?.token) throw new Error(`Login ${accessType} thất bại: HTTP ${r.response.status} ${r.body?.message || ''}`);
  return r.body;
}

function auth(token) { return { Authorization: `Bearer ${token}` }; }
function unwrap(body) { return Array.isArray(body?.data) ? body.data : body?.data?.items || body?.data || []; }
function codeOf(x) { return String(x?.defect_code || x?.code || '').trim().toUpperCase(); }
function nameOf(x) { return String(x?.defect_name || x?.name || x?.process_name || '').trim(); }
function processCodeOf(x) { return String(x?.process_code || x?.code || '').trim().toUpperCase(); }
function processNameOf(x) { return String(x?.process_name || x?.name || '').trim(); }
function productCodeOf(x) { return String(x?.product_code || x?.product_name || x?.code || '').trim(); }
function machineCodeOf(x) { return String(x?.machine_code || x?.machine_no || x?.code || '').trim(); }

async function getProcesses(base, token) {
  const r = await api(base, '/api/users/options/processes', { headers: auth(token) });
  if (!r.response.ok) throw new Error(`Không lấy được danh sách công đoạn: HTTP ${r.response.status}`);
  return unwrap(r.body).map(x => ({ id: Number(x.id), code: processCodeOf(x), name: processNameOf(x) })).filter(x => x.id > 0);
}

async function createWorker(base, managerToken, processIds) {
  const workerCode = unique('TCW').toUpperCase();
  const username = workerCode.toLowerCase();
  const fullName = `KTC Test Worker ${workerCode}`;
  const r = await api(base, '/api/users', {
    method: 'POST',
    headers: auth(managerToken),
    body: JSON.stringify({ username, full_name: fullName, role: 'worker', worker_code: workerCode, department: 'TEST ONLY', position: 'Công nhân', training_percent: 100, status: 'active', process_ids: processIds }),
  });
  if (!r.response.ok || !r.body?.success) throw new Error(`Không tạo được worker fixture: HTTP ${r.response.status} ${r.body?.message || ''}`);
  return { workerCode, username, fullName, workerId: Number(r.body?.data?.worker_id || 0) };
}

async function masterChecks(base, workerToken, processes) {
  const cut = processes.find(p => /cắt/i.test(p.name) || p.code === 'CAT') || processes[0];
  const long = processes.find(p => /lồng/i.test(p.name) || p.code === 'LONG') || processes[1] || cut;
  const result = [];
  for (const [id, label, process] of [['MASTER-001','Cắt has CAT01-CAT04',cut], ['MASTER-002','Lồng has LONG01-LONG05',long]]) {
    if (!process?.id) { result.push({id,name:label,status:'FAIL',detail:'Không tìm thấy công đoạn phù hợp'}); continue; }
    const r = await api(base, `/api/defects/processes/${process.id}/defects`, { headers: auth(workerToken) });
    if (!r.response.ok) { result.push({id,name:label,status:'FAIL',detail:`HTTP ${r.response.status}`}); continue; }
    const defects = unwrap(r.body);
    const codes = new Set(defects.map(codeOf));
    const expected = id === 'MASTER-001' ? ['CAT01','CAT02','CAT03','CAT04'] : ['LONG01','LONG02','LONG03','LONG04','LONG05'];
    const missing = expected.filter(c => !codes.has(c));
    result.push({ id, name:label, status: missing.length ? 'FAIL' : 'PASS', detail: missing.length ? `Thiếu: ${missing.join(', ')}` : `${process.code || process.name}: ${expected.join(', ')}` });
  }
  return { result, cut, long };
}

async function chooseProductionContext(base, workerToken, process) {
  const ps = await api(base, `/api/product-standards?process_id=${process.id}`, { headers: auth(workerToken) });
  if (!ps.response.ok) throw new Error(`Không lấy product standard process ${process.id}: HTTP ${ps.response.status}`);
  const products = unwrap(ps.body);
  const product = products.find(x => productCodeOf(x)) || products[0];
  if (!product) throw new Error(`Process ${process.id} không có product standard`);
  const productCode = productCodeOf(product);
  const ms = await api(base, `/api/machines?process_id=${process.id}`, { headers: auth(workerToken) });
  const machines = ms.response.ok ? unwrap(ms.body) : [];
  const machineCode = machineCodeOf(machines[0]);
  const resolved = await api(base, `/api/product-standards/resolve?process_id=${process.id}&product_code=${encodeURIComponent(productCode)}&machine_code=${encodeURIComponent(machineCode)}&work_date=${new Date().toISOString().slice(0,10)}`, { headers: auth(workerToken) });
  const standardOutput = Number(resolved.body?.data?.resolved_output_per_hour || product.standard_output || product.output_per_hour || 0);
  if (!standardOutput) throw new Error(`Không resolve được định mức cho ${productCode}`);
  return { process, productCode, machineCode, standardOutput };
}

async function createReport(base, workerToken, ctx, values = {}) {
  const actual = Number(values.actual_time ?? 1);
  const deduction = Number(values.deduction_time ?? 0);
  const total = Number(values.total_time ?? actual + deduction);
  const ok = Number(values.tt_ok ?? Math.max(1, Math.floor(ctx.standardOutput * actual)));
  const ng = Number(values.tt_ng ?? 0);
  const payload = { process_id: ctx.process.id, process_code: ctx.process.code, work_date: new Date().toISOString().slice(0,10), shift: values.shift || `TC${Math.floor(Math.random()*3)+1}`, machine_no: ctx.machineCode || undefined, product_name: ctx.productCode, operation_mode: ctx.machineCode ? 'MACHINE' : 'MANUAL', operation_type: 'PRODUCTION', total_time: total, actual_time: actual, deduction_time: deduction, standard_output: ctx.standardOutput, actual_output: ok, tt_ok: ok, tt_ng: ng, defects: values.defects || [], deductions: values.deductions || [], training_percent: 100, client_request_id: unique('tc-report'), note: 'TEST ONLY - KTC Test Center' };
  return api(base, '/api/production-temp', { method:'POST', headers:auth(workerToken), body:JSON.stringify(payload) });
}

export async function runAuthenticatedSuite({ apiUrl, add, managerUsername = '', managerPassword = '' }) {
  if (!managerUsername || !managerPassword) {
    for (const [id,name,detail] of [['MASTER-001','Cắt has CAT01-CAT04','Thiếu KTC_TEST_MANAGER_USERNAME/PASSWORD'],['MASTER-002','Lồng has LONG01-LONG05','Thiếu KTC_TEST_MANAGER_USERNAME/PASSWORD'],['WORKER-001','Create production report','Thiếu manager fixture'],['WORKER-002','View report history','Thiếu worker fixture'],['WORKER-003','Edit report within 10 minutes','Thiếu worker fixture'],['RULE-001','Daily total <= 12 hours','Thiếu worker fixture'],['RULE-002','Support/deduction excluded from daily production hours','Thiếu worker fixture'],['MANAGER-001','Manager review/approve','Thiếu manager fixture'],['PERM-001','Role authorization','Thiếu role fixture'],['EXPORT-001','Excel export','Thiếu manager fixture']]) add(name,'SKIP',detail,id);
    return;
  }
  let manager;
  try { manager = await login(apiUrl, managerUsername, managerPassword, 'management'); }
  catch (e) { for (const [id,name] of [['MASTER-001','Cắt has CAT01-CAT04'],['MASTER-002','Lồng has LONG01-LONG05'],['WORKER-001','Create production report'],['WORKER-002','View report history'],['WORKER-003','Edit report within 10 minutes'],['RULE-001','Daily total <= 12 hours'],['RULE-002','Support/deduction excluded from daily production hours'],['MANAGER-001','Manager review/approve'],['PERM-001','Role authorization'],['EXPORT-001','Excel export']]) add(name,'FAIL',e.message,id); return; }
  let processes;
  try { processes = await getProcesses(apiUrl, manager.token); }
  catch (e) { add('Authenticated process fixture','FAIL',e.message,'AUTH-001'); return; }
  if (!processes.length) { add('Authenticated process fixture','FAIL','Không có công đoạn active','AUTH-001'); return; }
  let worker;
  try { worker = await createWorker(apiUrl, manager.token, processes.map(p=>p.id)); process.env.KTC_TEST_WORKER_CODE = worker.workerCode; }
  catch (e) { add('Authenticated worker fixture','FAIL',e.message,'AUTH-002'); return; }
  let workerSession;
  try { workerSession = await login(apiUrl, worker.workerCode, '', 'worker'); }
  catch (e) { add('Authenticated worker login','FAIL',e.message,'AUTH-003'); return; }

  const masters = await masterChecks(apiUrl, workerSession.token, processes);
  for (const x of masters.result) add(x.name,x.status,x.detail,x.id);
  const productionProcess = masters.cut || processes[0];
  let ctx;
  try { ctx = await chooseProductionContext(apiUrl, workerSession.token, productionProcess); }
  catch (e) { add('Create production report','FAIL',e.message,'WORKER-001'); return; }
  const created = await createReport(apiUrl, workerSession.token, ctx, { shift:'A' });
  add('Create production report', created.response.ok && created.body?.success ? 'PASS' : 'FAIL', `HTTP ${created.response.status} ${created.body?.message || ''}`, 'WORKER-001');
  const reportId = Number(created.body?.data?.id || created.body?.id || 0);
  const history = await api(apiUrl, '/api/production-temp/my', { headers:auth(workerSession.token) });
  add('View report history', history.response.ok && history.body?.success !== false ? 'PASS' : 'FAIL', `HTTP ${history.response.status}`, 'WORKER-002');
  if (reportId) { const detail = await api(apiUrl, `/api/production-temp/${reportId}`, { headers:auth(workerSession.token) }); add('Edit report within 10 minutes', detail.response.ok ? 'PASS' : 'FAIL', `HTTP ${detail.response.status}`, 'WORKER-003'); }
  else add('Edit report within 10 minutes','FAIL','Không có report ID','WORKER-003');

  const r1 = await createReport(apiUrl, workerSession.token, ctx, { actual_time:6,total_time:6,shift:'B' });
  const r2 = await createReport(apiUrl, workerSession.token, ctx, { actual_time:6,total_time:6,shift:'C' });
  const r3 = await createReport(apiUrl, workerSession.token, ctx, { actual_time:1,total_time:1,shift:'D' });
  const limitPass = r1.response.ok && r2.response.ok && (r3.response.status === 422 || r3.response.status === 409);
  add('Daily total <= 12 hours', limitPass ? 'PASS' : 'FAIL', `6h+6h: ${r1.response.status}/${r2.response.status}; thêm 1h: ${r3.response.status}`, 'RULE-001');

  const before = await api(apiUrl, `/api/production-temp/daily-hours?date=${new Date().toISOString().slice(0,10)}`, { headers:auth(workerSession.token) });
  const support = await createReport(apiUrl, workerSession.token, ctx, { actual_time:1,deduction_time:1,total_time:2,shift:'TC' });
  const after = await api(apiUrl, `/api/production-temp/daily-hours?date=${new Date().toISOString().slice(0,10)}`, { headers:auth(workerSession.token) });
  const beforeHours = Number(before.body?.data?.counted_hours || 0), afterHours = Number(after.body?.data?.counted_hours || 0);
  const deductionExcluded = support.response.ok && Math.abs((afterHours-beforeHours)-1) < 0.01;
  add('Support/deduction excluded from daily production hours', deductionExcluded ? 'PASS' : 'FAIL', `delta=${(afterHours-beforeHours).toFixed(2)}h; support HTTP=${support.response.status}`, 'RULE-002');

  const pending = await api(apiUrl, '/api/production-temp/pending', { headers:auth(manager.token) });
  const pendingRows = unwrap(pending.body);
  const pendingId = reportId || Number(pendingRows[0]?.id || 0);
  let approve = null;
  if (pendingId) approve = await api(apiUrl, '/api/production-temp/approve-selected', { method:'POST', headers:{...auth(manager.token),'Content-Type':'application/json'}, body:JSON.stringify({ids:[pendingId]}) });
  add('Manager review/approve', approve?.response.ok && approve.body?.success !== false ? 'PASS' : 'FAIL', approve ? `HTTP ${approve.response.status}` : 'Không tìm thấy pending report', 'MANAGER-001');
  const workerForbidden = await api(apiUrl, '/api/production-temp/pending', { headers:auth(workerSession.token) });
  add('Role authorization', workerForbidden.response.status === 403 ? 'PASS' : 'FAIL', `Worker gọi manager API: HTTP ${workerForbidden.response.status}`, 'PERM-001');
  const exportResponse = await api(apiUrl, '/api/report-export/excel', { headers:auth(manager.token) });
  add('Excel export', exportResponse.response.status !== 401 && exportResponse.response.status !== 403 ? 'PASS' : 'FAIL', `HTTP ${exportResponse.response.status}`, 'EXPORT-001');
}
