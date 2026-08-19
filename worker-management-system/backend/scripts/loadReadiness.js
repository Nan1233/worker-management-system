require('dotenv').config();
const db = require('../config/db');

const REQUESTS = Math.max(20, Math.min(5000, Number(process.env.KTC_LOAD_REQUESTS) || 300));
const CONCURRENCY = Math.max(1, Math.min(100, Number(process.env.KTC_LOAD_CONCURRENCY) || 20));
const API_BASE = String(process.env.KTC_LOAD_API_BASE || '').replace(/\/$/, '');

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

async function runPool(task) {
  let cursor = 0;
  const durations = [];
  let failures = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= REQUESTS) return;
      const started = Date.now();
      try { await task(index); } catch (error) { failures += 1; if (failures <= 5) console.error('[KTC] load sample failure:', error.message); }
      durations.push(Date.now() - started);
    }
  }
  await Promise.all(Array.from({length: CONCURRENCY}, worker));
  return {
    requests: REQUESTS,
    concurrency: CONCURRENCY,
    failures,
    p50Ms: percentile(durations, .50),
    p95Ms: percentile(durations, .95),
    p99Ms: percentile(durations, .99),
    maxMs: Math.max(0, ...durations)
  };
}

async function main() {
  await db.testConnection();
  const database = await runPool(async () => {
    await db.promise().query({sql:'SELECT 1 AS ok', timeout:5000});
  });
  let api = null;
  if (API_BASE) {
    api = await runPool(async () => {
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(), 7000);
      try {
        const response = await fetch(`${API_BASE}/api/health/ready`, {signal: controller.signal, headers:{'cache-control':'no-cache'}});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } finally { clearTimeout(timer); }
    });
  }
  const result={success:database.failures===0 && (!api || api.failures===0),database,api,note:'Read-only readiness load. Does not create production reports.'};
  console.log(JSON.stringify(result,null,2));
  if (!result.success) process.exitCode=1;
  await db.closePool().catch(()=>{});
}
main().catch(async(error)=>{console.error('[KTC] Readiness load failed:',error);process.exitCode=1;await db.closePool().catch(()=>{});});
