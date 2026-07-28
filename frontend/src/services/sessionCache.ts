interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  pending?: Promise<T>;
}

const entries = new Map<string, CacheEntry<unknown>>();
const STORAGE_PREFIX = "ktc-session-cache:";

function readStored<T>(key: string): CacheEntry<T> | undefined {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { value: T; expiresAt: number };
    if (!parsed || parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
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
      `${STORAGE_PREFIX}${key}`,
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
  let current = entries.get(key) as CacheEntry<T> | undefined;

  if (!current) {
    current = readStored<T>(key);
    if (current) entries.set(key, current);
  }

  if (current?.value !== undefined && current.expiresAt > now) {
    return current.value;
  }

  if (current?.pending) return current.pending;

  const pending = loader()
    .then((value) => {
      const expiresAt = Date.now() + ttlMs;
      entries.set(key, { value, expiresAt });
      writeStored(key, value, expiresAt);
      return value;
    })
    .catch((error) => {
      entries.delete(key);
      try { sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`); } catch { /* noop */ }
      throw error;
    });

  entries.set(key, { expiresAt: 0, pending });
  return pending;
}

export function clearSessionCache(prefix?: string): void {
  if (!prefix) {
    entries.clear();
    try {
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (key?.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(key);
      }
    } catch { /* noop */ }
    return;
  }

  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }

  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const storageKey = sessionStorage.key(index);
      if (storageKey?.startsWith(`${STORAGE_PREFIX}${prefix}`)) {
        sessionStorage.removeItem(storageKey);
      }
    }
  } catch { /* noop */ }
}
