import { getStoredUser } from "../utils/authStorage";

const PREFIX = "ktc-offline-snapshot:v1:";

function identityScope(): string {
  const user = getStoredUser();
  if (!user) return "anonymous";
  return [user.id ?? "0", user.worker_id ?? "0", String(user.worker_code || "-").trim().toUpperCase()].join(":");
}

function key(name: string): string {
  return `${PREFIX}${identityScope()}:${name}`;
}

export function writeOfflineSnapshot<T>(name: string, value: T): void {
  try {
    localStorage.setItem(key(name), JSON.stringify({ value, savedAt: Date.now() }));
  } catch {
    // Không để lỗi quota cache làm hỏng luồng online.
  }
}

export function readOfflineSnapshot<T>(name: string): T | null {
  try {
    const raw = localStorage.getItem(key(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value?: T };
    return parsed && Object.prototype.hasOwnProperty.call(parsed, "value") ? (parsed.value as T) : null;
  } catch {
    return null;
  }
}

export function isOfflineLikeError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const maybe = error as { code?: string; response?: unknown };
  return !maybe?.response || maybe?.code === "ERR_NETWORK" || maybe?.code === "ECONNABORTED";
}
