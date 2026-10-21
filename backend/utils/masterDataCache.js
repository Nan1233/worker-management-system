const { TtlCache } = require("./cache");

const masterDataCache = new TtlCache({ maxEntries: 300 });
const pendingLoads = new Map();

const TTL = Object.freeze({
  // Short TTL so manual SQL/master edits reach workers within ~1 minute.
  machines: 60 * 1000,
  productStandards: 60 * 1000,
  defects: 60 * 60 * 1000,
  deductions: 60 * 60 * 1000,
});

async function getOrLoadMasterData(cacheKey, ttlMs, loader) {
  const cached = masterDataCache.get(cacheKey);
  if (cached !== undefined && cached !== null) return cached;

  if (pendingLoads.has(cacheKey)) return pendingLoads.get(cacheKey);

  const pending = Promise.resolve()
    .then(loader)
    .then((data) => {
      masterDataCache.set(cacheKey, data, ttlMs);
      return data;
    })
    .finally(() => pendingLoads.delete(cacheKey));

  pendingLoads.set(cacheKey, pending);
  return pending;
}

module.exports = { masterDataCache, TTL, getOrLoadMasterData };
