interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  pending?: Promise<T>;
}

const entries = new Map<string, CacheEntry<unknown>>();

export async function getSessionCached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const current = entries.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();

  if (current?.value !== undefined && current.expiresAt > now) {
    return current.value;
  }

  if (current?.pending) return current.pending;

  const pending = loader()
    .then((value) => {
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      entries.delete(key);
      throw error;
    });

  entries.set(key, { expiresAt: 0, pending });
  return pending;
}

export function clearSessionCache(prefix?: string): void {
  if (!prefix) {
    entries.clear();
    return;
  }

  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}
