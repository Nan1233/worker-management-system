const { TtlCache } = require("./cache");

const authUserCache = new TtlCache({ maxEntries: 1000 });
const pendingLoads = new Map();
const invalidationEpochs = new Map();
const AUTH_USER_TTL_MS = Math.max(
  5_000,
  Number(process.env.AUTH_USER_CACHE_TTL_MS || 60_000),
);

function keyFor(userId) {
  return `auth-user:${Number(userId)}`;
}

function normalizeAuthUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    username: user.username,
    role: String(user.role || "").trim().toLowerCase(),
    status: user.status,
    worker_id: user.worker_id ? Number(user.worker_id) : null,
    worker_code: user.worker_code ? String(user.worker_code).trim() : null,
    worker_status: user.worker_status || null,
    database_name: user.database_name || null,
  };
}

function getCachedAuthUser(userId) {
  return authUserCache.get(keyFor(userId));
}

function setCachedAuthUser(user, ttlMs = AUTH_USER_TTL_MS) {
  const normalized = normalizeAuthUser(user);
  if (!normalized?.id) return;
  authUserCache.set(keyFor(normalized.id), normalized, ttlMs);
}

function deleteCachedAuthUser(userId) {
  const cacheKey = keyFor(userId);
  authUserCache.deleteByPrefix(cacheKey);
  pendingLoads.delete(cacheKey);
  invalidationEpochs.set(cacheKey, (invalidationEpochs.get(cacheKey) || 0) + 1);
}

async function getOrLoadAuthUser(userId, loader) {
  const cacheKey = keyFor(userId);
  const cached = authUserCache.get(cacheKey);
  if (cached) return cached;

  if (pendingLoads.has(cacheKey)) return pendingLoads.get(cacheKey);

  const loadEpoch = invalidationEpochs.get(cacheKey) || 0;
  const pending = Promise.resolve()
    .then(loader)
    .then((user) => {
      const normalized = normalizeAuthUser(user);
      if (normalized && (invalidationEpochs.get(cacheKey) || 0) === loadEpoch) {
        authUserCache.set(cacheKey, normalized, AUTH_USER_TTL_MS);
      }
      return normalized;
    })
    .finally(() => {
      if (pendingLoads.get(cacheKey) === pending) pendingLoads.delete(cacheKey);
    });

  pendingLoads.set(cacheKey, pending);
  return pending;
}

module.exports = {
  AUTH_USER_TTL_MS,
  getCachedAuthUser,
  setCachedAuthUser,
  deleteCachedAuthUser,
  getOrLoadAuthUser,
  _test: { keyFor, normalizeAuthUser, invalidationEpochs, pendingLoads },
};
