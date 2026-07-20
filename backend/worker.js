require('dotenv').config();
require('./config/db');
const SyncJobService = require('./services/syncJobService');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    const pollMs = Math.max(Number(process.env.SYNC_WORKER_POLL_MS || 15000), 5000);
    console.log(`Sync worker started; poll=${pollMs}ms`);
    while (true) {
        try {
            await SyncJobService.processReadyJobs(Number(process.env.SYNC_WORKER_BATCH || 5));
        } catch (error) {
            console.error('SYNC WORKER LOOP ERROR:', error);
        }
        await sleep(pollMs);
    }
}

main().catch((error) => {
    console.error('SYNC WORKER FATAL:', error);
    process.exit(1);
});
