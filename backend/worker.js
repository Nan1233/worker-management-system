require('dotenv').config();
const db = require('./config/db');
const SyncJobService = require('./services/syncJobService');
const { validateEnvironment } = require('./config/validateEnvironment');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let stopping = false;

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  validateEnvironment(process.env, { production: isProduction });
  const database = await db.testConnection();
  const pollMs = Math.max(Number(process.env.SYNC_WORKER_POLL_MS || 15000), 5000);
  const batchSize = Math.min(50, Math.max(1, Number(process.env.SYNC_WORKER_BATCH || 5)));

  console.log(`Sync worker started; db=${database.host}:${database.port}; poll=${pollMs}ms; batch=${batchSize}`);

  while (!stopping) {
    try {
      await SyncJobService.processReadyJobs(batchSize);
    } catch (error) {
      console.error('SYNC WORKER LOOP ERROR:', error?.message || error);
    }
    if (!stopping) await sleep(pollMs);
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received; stopping sync worker`);
  await db.closePool().catch((error) => console.error('WORKER POOL CLOSE FAILED:', error.message));
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

main()
  .then(() => shutdown('WORKER_COMPLETE'))
  .catch(async (error) => {
    console.error('SYNC WORKER FATAL:', error?.message || error);
    await db.closePool().catch(() => undefined);
    process.exitCode = 1;
  });
