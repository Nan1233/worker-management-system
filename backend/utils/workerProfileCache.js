const { TtlCache } = require("./cache");

const cache = new TtlCache({ maxEntries: 1000 });
const pendingLoads = new Map();
const TTL_MS = Math.max(30_000, Number(process.env.WORKER_PROFILE_CACHE_TTL_MS || 10 * 60 * 1000));

function key(userId) {
  return `worker-profile:${Number(userId)}`;
}

async function getOrLoadWorkerProfile(userId, loader) {
  const cacheKey = key(userId);
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  if (pendingLoads.has(cacheKey)) return pendingLoads.get(cacheKey);

  const pending = Promise.resolve()
    .then(loader)
    .then((value) => {
      if (value) cache.set(cacheKey, value, TTL_MS);
      return value;
    })
    .finally(() => pendingLoads.delete(cacheKey));

  pendingLoads.set(cacheKey, pending);
  return pending;
}

function clearWorkerProfile(userId) {
  cache.deleteByPrefix(key(userId));
}

module.exports = { TTL_MS, getOrLoadWorkerProfile, clearWorkerProfile };
