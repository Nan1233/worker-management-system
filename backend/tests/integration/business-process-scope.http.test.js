'use strict';

// Live HTTP and disposable TiDB: 9 canonical processes x 4 shifts, role-scoped
// pending queues. Rows are deliberately seeded via SQL to isolate authorization,
// NOT to claim 36 successful process-specific production submissions.
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');

const opts = { skip: h.skipReason };
const CODES = ['GC','MAI','DO','K1','K2','CAN','EP','XLBV','SX3'];
const SHIFTS = ['A','B','C','D'];
const state = { ids: new Map(), tokens: new Map(), processIds: new Map() };

test.before(async () => {
  if (!h.enabled) return;
  const { db } = await h.start();
  state.db = db;
  const [all] = await db.query(
    `SELECT id,process_code FROM processes WHERE process_code IN ('GC','MAI','DO','K1','K2','CAN','EP','XLBV','SX3')`
  );
  assert.equal(all.length,9,'database fixture must contain all nine canonical processes');
  for(const row of all) state.processIds.set(row.process_code,Number(row.id));
  const worker = await h.createUser(db,{
    username:'MATRIX-WORKER',role:'worker',workerCode:'MATRIX-WORKER',
    processCodes:CODES,
  });
  state.workerId=worker.workerId;
  state.workerToken=(await h.loginWorker('MATRIX-WORKER')).token;
  for(const code of CODES) {
    const username='matrix-manager-'+code.toLowerCase();
    await h.createUser(db,{username,role:'manager',processCodes:[code]});
    state.tokens.set(code,(await h.loginManagement(username,'Passw0rd!x')).token);
    assert.ok(state.tokens.get(code),'missing manager token for '+code);
  }
  await h.createUser(db,{username:'matrix-lead',role:'lead',processCodes:['XLBV']});
  await h.createUser(db,{username:'matrix-admin',role:'admin'});
  state.leadToken=(await h.loginManagement('matrix-lead','Passw0rd!x')).token;
  state.adminToken=(await h.loginManagement('matrix-admin','Passw0rd!x')).token;
  assert.ok(state.workerToken && state.leadToken && state.adminToken);

  let number=0;
  const workDate=h.vnDate(-1);
  for(const code of CODES)for(const shift of SHIFTS) {
    number++;
    const processId=state.processIds.get(code);
    const [result]=await db.query(
      `INSERT INTO production_reports_temp
       (worker_id,process_id,work_date,entry_date,shift,operation_mode,
        product_name,total_time,actual_time,deduction_time,standard_output,
        actual_output,tt_ok,tt_ng,training_percent_snapshot,
        client_request_id,status)
       VALUES (?,?,?,? ,?,'MANUAL',?,1,1,0,100,8,8,0,100,?,'pending')`,
      [state.workerId,processId,workDate,workDate,shift,'MATRIX-PRODUCT',`business-matrix-${number}`]
    );
    state.ids.set(code+':'+shift,Number(result.insertId));
  }
});
test.after(async () => { if (h.enabled) await h.stop(); });

function rowsOf(response) {
  const data=response.body?.data;
  const rows=data?.reports || data?.rows || data;
  assert.ok(Array.isArray(rows),JSON.stringify(response.body));
  return rows;
}

test('real disposable TiDB persists all 36 process-shift pending report identities',opts,async()=>{
  const [rows]=await state.db.query(
    "SELECT process_id,shift,COUNT(*) AS c FROM production_reports_temp WHERE client_request_id LIKE 'business-matrix-%' GROUP BY process_id,shift"
  );
  assert.equal(rows.length,36);
  for(const row of rows) assert.equal(Number(row.c),1);
  assert.equal(state.ids.size,36);
});

test('real HTTP pending queue isolates all nine managers to exactly four shifts each',opts,async()=>{
  for(const code of CODES) {
    const response=await h.request('GET','/api/production-temp/pending',{
      token:state.tokens.get(code)
    });
    assert.equal(response.status,200,code+' '+JSON.stringify(response.body));
    const rows=rowsOf(response);
    const ours=rows.filter(row=>state.ids.has(code+':'+row.shift) &&
      state.ids.get(code+':'+row.shift)===Number(row.id));
    assert.deepEqual(ours.map(row=>row.shift).sort(),[...SHIFTS].sort(),code);
    for(const row of rows) {
      assert.equal(Number(row.process_id),state.processIds.get(code),
        code+' manager must not see another process');
    }
  }
});

test('lead sees only its process, admin sees pending, worker cannot review',opts,async()=>{
  const lead=await h.request('GET','/api/production-temp/pending',{token:state.leadToken});
  assert.equal(lead.status,200,JSON.stringify(lead.body));
  const rows=rowsOf(lead);
  assert.equal(rows.length,4);
  assert.deepEqual(rows.map(x=>x.shift).sort(),[...SHIFTS].sort());
  assert.ok(rows.every(x=>Number(x.process_id)===state.processIds.get('XLBV')));
  const admin=await h.request('GET','/api/production-temp/pending',{token:state.adminToken});
  assert.equal(admin.status,200,JSON.stringify(admin.body));
  assert.ok(rowsOf(admin).length>0);
  const worker=await h.request('GET','/api/production-temp/pending',{token:state.workerToken});
  assert.ok([401,403].includes(worker.status),'worker cannot review: '+worker.status);
});

test('no manager may approve an out-of-scope shift/report and no source row changes',opts,async()=>{
  for(let i=0;i<CODES.length;i++){
    const owner=CODES[i],foreign=CODES[(i+1)%CODES.length];
    const id=state.ids.get(foreign+':D');
    const response=await h.request('POST','/api/production-temp/approve-selected',{
      token:state.tokens.get(owner),body:{ids:[id]}
    });
    assert.ok([403,409].includes(response.status),
      owner+' cannot approve '+foreign+': '+response.status+' '+JSON.stringify(response.body));
    const [[row]]=await state.db.query('SELECT status FROM production_reports_temp WHERE id=?',[id]);
    assert.equal(row.status,'pending','failed out-of-scope approval cannot mutate report');
    const [[count]]=await state.db.query('SELECT COUNT(*) AS c FROM production_reports WHERE source_temp_id=?',[id]);
    assert.equal(Number(count.c),0,'no approved report may be created');
  }
});
