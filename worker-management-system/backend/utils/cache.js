class TtlCache {
  constructor({ maxEntries = 200 } = {}) {
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  get(key) {
    const item = this.entries.get(key);
    if (!item) return undefined;
    if (item.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh insertion order for a small LRU-like eviction policy.
    this.entries.delete(key);
    this.entries.set(key, item);
    return item.value;
  }

  set(key, value, ttlMs) {
    if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  deleteByPrefix(prefix) {
    for (const key of this.entries.keys()) {
      if (String(key).startsWith(prefix)) this.entries.delete(key);
    }
  }

  clear() {
    this.entries.clear();
  }
}

module.exports = { TtlCache };
