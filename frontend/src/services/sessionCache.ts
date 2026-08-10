interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  pending?: Promise<T>;
}

const entries = new Map<string, CacheEntry<unknown>>();
const STORAGE_PREFIX = "ktc-session-cache:";
const CACHE_SCOPE_KEY = "ktc-session-cache-scope";
let cacheGeneration = 0;

function normalizeScope(scope?: string | null): string {
  const value = String(scope || "").trim();
  return value || "anonymous";
}

function getScope(): string {
  try {
    return normalizeScope(sessionStorage.getItem(CACHE_SCOPE_KEY));
  } catch {
    return "anonymous";
  }
}

function scopedKey(key: string): string {
  return `${getScope()}:${key}`;
}

function storedKey(key: string): string {
  return `${STORAGE_PREFIX}${scopedKey(key)}`;
}

function readStored<T>(key: string): CacheEntry<T> | undefined {
  try {
    const raw = sessionStorage.getItem(storedKey(key));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { value: T; expiresAt: number };
    if (!parsed || parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(storedKey(key));
      return undefined;
    }
    return { value: parsed.value, expiresAt: parsed.expiresAt };
  } catch {
    return undefined;
  }
}

function writeStored<T>(key: string, value: T, expiresAt: number): void {
  try {
    sessionStorage.setItem(
      storedKey(key),
      JSON.stringify({ value, expiresAt }),
    );
  } catch {
    // Safari private mode hoặc thiết bị hết quota: cache RAM vẫn hoạt động.
  }
}

export async function getSessionCached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const generationAtStart = cacheGeneration;
  const scoped = scopedKey(key);
  let current = entries.get(scoped) as CacheEntry<T> | undefined;

  if (!current) {
    current = readStored<T>(key);
    if (current) entries.set(scoped, current);
  }

  if (current?.value !== undefined && current.expiresAt > now) {
    return current.value;
  }

  if (current?.pending) return current.pending;

  const pending = loader()
    .then((value) => {
      // Nếu người dùng đã đăng xuất/đổi tài khoản trong lúc request chạy,
      // không cho response của tài khoản cũ ghi lại cache của danh tính mới.
      if (generationAtStart !== cacheGeneration || scoped !== scopedKey(key)) return value;
      const expiresAt = Date.now() + ttlMs;
      entries.set(scoped, { value, expiresAt });
      writeStored(key, value, expiresAt);
      return value;
    })
    .catch((error) => {
      if (generationAtStart === cacheGeneration && scoped === scopedKey(key)) {
        entries.delete(scoped);
        try { sessionStorage.removeItem(storedKey(key)); } catch { /* noop */ }
      }
      throw error;
    });

  entries.set(scoped, { expiresAt: 0, pending });
  return pending;
}

/**
 * Bind all session-cache entries to the authenticated identity/session.
 * Changing scope invalidates in-flight responses from the previous identity.
 */
export function setSessionCacheScope(scope?: string | null): void {
  const next = normalizeScope(scope);
  const previous = getScope();
  if (previous === next) return;

  cacheGeneration += 1;
  entries.clear();
  try {
    sessionStorage.setItem(CACHE_SCOPE_KEY, next);
  } catch { /* noop */ }
}

export function clearSessionCache(prefix?: string): void {
  // Vô hiệu hóa cả những Promise cũ đang chạy, không chỉ dữ liệu đã lưu.
  cacheGeneration += 1;
  const scopePrefix = `${getScope()}:`;

  if (!prefix) {
    for (const key of [...entries.keys()]) {
      if (key.startsWith(scopePrefix)) entries.delete(key);
    }
    try {
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (key?.startsWith(`${STORAGE_PREFIX}${scopePrefix}`)) sessionStorage.removeItem(key);
      }
    } catch { /* noop */ }
    return;
  }

  const scopedPrefix = `${scopePrefix}${prefix}`;
  for (const key of [...entries.keys()]) {
    if (key.startsWith(scopedPrefix)) entries.delete(key);
  }

  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const storageKey = sessionStorage.key(index);
      if (storageKey?.startsWith(`${STORAGE_PREFIX}${scopedPrefix}`)) {
        sessionStorage.removeItem(storageKey);
      }
    }
  } catch { /* noop */ }
}

export function clearAllSessionCaches(): void {
  cacheGeneration += 1;
  entries.clear();
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch { /* noop */ }
}
