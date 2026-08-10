const { spawnSync } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

const root = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const gates = [];

function run(name, args, required = true) {
  process.stdout.write(`\n[KTC PILOT] ${name}\n`);
  const r = spawnSync(npm, args, { cwd: root, stdio: 'inherit', env: process.env });
  const ok = r.status === 0;
  gates.push({ name, status: ok ? 'PASS' : (required ? 'FAIL' : 'WARN') });
  return ok;
}
function skip(name, reason) { gates.push({ name, status: 'SKIP', reason }); }

function checkUrl(name, url, required = true) {
  process.stdout.write(`\n[KTC PILOT] ${name}\n`);
  return new Promise((resolve) => {
    const client = String(url).startsWith('https:') ? https : http;
    const req = client.get(url, { timeout: 10000, headers: { 'user-agent': 'KTC-Pilot-Readiness/1.0' } }, (res) => {
      let body=''; res.setEncoding('utf8'); res.on('data',c=>body+=c); res.on('end',()=>{
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        gates.push({ name, status: ok ? 'PASS' : (required ? 'FAIL' : 'WARN'), reason: ok ? undefined : `HTTP ${res.statusCode}: ${body.slice(0,160)}` });
        resolve(ok);
      });
    });
    req.on('timeout',()=>req.destroy(new Error('timeout')));
    req.on('error',(error)=>{ gates.push({name,status:required?'FAIL':'WARN',reason:error.message}); resolve(false); });
  });
}


async function main(){
let requiredOk = true;
requiredOk = run('Source verify + automated regression', ['run','verify']) && requiredOk;
requiredOk = run('Database integrity', ['run','db:integrity']) && requiredOk;
requiredOk = run('Real production data validation', ['run','validate:real-data']) && requiredOk;

const apiBase = String(process.env.KTC_PILOT_API_BASE || '').trim().replace(/\/$/,'');
if(apiBase){
  requiredOk = (await checkUrl('External liveness', `${apiBase}/api/health/live`, true)) && requiredOk;
  requiredOk = (await checkUrl('External readiness + database', `${apiBase}/api/health/ready`, true)) && requiredOk;
}else skip('External live/ready monitoring', 'Set KTC_PILOT_API_BASE');

const excelDir = String(process.env.KTC_PILOT_EXCEL_DIR || '').trim();
const month = String(process.env.KTC_PILOT_MONTH || '').trim();
if (excelDir && month) {
  requiredOk = run('Real Excel folder validation', ['--prefix','desktop','run','validate:excel-folder','--',excelDir,month]) && requiredOk;
} else skip('Real Excel folder validation', 'Set KTC_PILOT_EXCEL_DIR and KTC_PILOT_MONTH');

const backup = String(process.env.KTC_PILOT_BACKUP_FILE || '').trim();
if (backup) requiredOk = run('Backup integrity drill', ['run','backup:drill','--',backup]) && requiredOk;
else skip('Backup integrity drill', 'Set KTC_PILOT_BACKUP_FILE');

if (backup && process.env.KTC_PILOT_RUN_RESTORE === '1') {
  requiredOk = run('Staging restore rehearsal', ['run','restore:rehearsal','--',backup]) && requiredOk;
} else skip('Staging restore rehearsal', 'Set KTC_PILOT_RUN_RESTORE=1 plus staging DB env; never point it at production');

if (process.env.KTC_PILOT_RUN_LOAD === '1') run('Read-only load/readiness test', ['run','load:readiness'], false);
else skip('Read-only load/readiness test', 'Set KTC_PILOT_RUN_LOAD=1 when the target API is ready');

console.log('\n================ KTC PILOT READINESS ================');
for (const gate of gates) console.log(`${gate.status.padEnd(4)}  ${gate.name}${gate.reason ? ` — ${gate.reason}` : ''}`);
console.log('=====================================================');
if (!requiredOk) {
  console.error('[KTC PILOT] NOT READY: at least one required gate failed.');
  process.exit(1);
}
console.log('[KTC PILOT] REQUIRED GATES PASS. Review SKIP/WARN items before full rollout.');
}
main().catch((error)=>{console.error('[KTC PILOT] readiness runner failed:',error);process.exit(1);});
