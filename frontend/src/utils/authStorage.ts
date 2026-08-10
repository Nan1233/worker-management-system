import { clearSessionCache, setSessionCacheScope } from "../services/sessionCache";

export interface AuthUser {
    id: number;
    worker_id?: number | null;
    worker_code?: string | null;
    username: string;
    full_name: string;
    role: "admin" | "manager" | "lead" | "worker";
}

const ACCESS_TOKEN_KEY = "accessToken";
const LEGACY_TOKEN_KEY = "token";
const REFRESH_TOKEN_KEY = "refreshToken";
const USER_KEY = "user";
const AUTH_EPOCH_KEY = "ktcAuthEpoch";
const AUTH_SESSION_ID_KEY = "ktcAuthSessionId";
const REFRESH_SESSION_HINT_KEY = "ktcRefreshSessionHint";

function isElectronRuntime(): boolean {
    return typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent);
}

/**
 * Web auth data is intentionally session-scoped. A long-lived refresh session
 * is restored from the backend HttpOnly cookie after browser restart.
 * Electron keeps the previous local-storage behavior as a native fallback.
 */
function authStorage(): Storage {
    return isElectronRuntime() ? localStorage : sessionStorage;
}

function readAuthValue(key: string, legacyKey?: string): string | null {
    const store = authStorage();
    const current = store.getItem(key) || (legacyKey ? store.getItem(legacyKey) : null);
    if (current) return current;

    // One-release migration from the old web implementation that persisted
    // access/user data in localStorage. Electron already uses localStorage.
    if (!isElectronRuntime()) {
        const legacy = localStorage.getItem(key) || (legacyKey ? localStorage.getItem(legacyKey) : null);
        if (legacy) {
            store.setItem(key, legacy);
            if (legacyKey) store.setItem(legacyKey, legacy);
            localStorage.removeItem(key);
            if (legacyKey) localStorage.removeItem(legacyKey);
            return legacy;
        }
    }

    return null;
}

function removeAuthValue(key: string): void {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
}

export function getAuthEpoch(): number {
    const raw = localStorage.getItem(AUTH_EPOCH_KEY);
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function bumpAuthEpoch(): number {
    const next = getAuthEpoch() + 1;
    localStorage.setItem(AUTH_EPOCH_KEY, String(next));
    return next;
}

export function getAuthSessionId(): string | null {
    return readAuthValue(AUTH_SESSION_ID_KEY);
}

export function setAuthSessionId(sessionId: string): void {
    authStorage().setItem(AUTH_SESSION_ID_KEY, sessionId);
}

export function createAuthSessionId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getAccessToken(): string | null {
    return readAuthValue(ACCESS_TOKEN_KEY, LEGACY_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
    const store = authStorage();
    store.setItem(ACCESS_TOKEN_KEY, token);
    store.setItem(LEGACY_TOKEN_KEY, token);

    if (!isElectronRuntime()) {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
}

/**
 * Web uses an HttpOnly cookie, so this function normally returns null there.
 * It can still return a legacy localStorage token during a one-release
 * migration, allowing the next refresh request to move that session to a
 * secure cookie. Electron intentionally retains the body-token fallback.
 */
export function hasRefreshSessionHint(): boolean {
    return localStorage.getItem(REFRESH_SESSION_HINT_KEY) === "1";
}

export function markRefreshSessionAvailable(): void {
    localStorage.setItem(REFRESH_SESSION_HINT_KEY, "1");
}

export function clearRefreshSessionHint(): void {
    localStorage.removeItem(REFRESH_SESSION_HINT_KEY);
}

export function getRefreshToken(): string | null {
    if (isElectronRuntime()) {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    }
    return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string): void {
    if (isElectronRuntime()) {
        localStorage.setItem(REFRESH_TOKEN_KEY, token);
        return;
    }
    // Normal web sessions never persist a JS-readable refresh token.
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearLegacyRefreshToken(): void {
    if (isElectronRuntime()) return;
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split(".")[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
        const decoded = decodeURIComponent(
            atob(padded)
                .split("")
                .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
                .join("")
        );
        return JSON.parse(decoded) as Record<string, unknown>;
    } catch {
        return null;
    }
}

export function recoverUserFromAccessToken(): AuthUser | null {
    const token = getAccessToken();
    if (!token) return null;
    const payload = decodeJwtPayload(token);
    if (!payload) return null;
    const role = String(payload.role || "");
    if (!["admin", "manager", "lead", "worker"].includes(role)) return null;
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) return null;
    const username = String(payload.username || "").trim();
    const workerCode = String(payload.worker_code || "").trim();
    const recovered: AuthUser = {
        id,
        worker_id: payload.worker_id == null ? null : Number(payload.worker_id),
        worker_code: workerCode || null,
        username: username || `user-${id}`,
        full_name: username || "Người dùng",
        role: role as AuthUser["role"]
    };
    setStoredUser(recovered);
    return recovered;
}

function cacheScopeForUser(user: AuthUser | null): string {
    if (!user) return "anonymous";
    return [
        `u${Number(user.id) || 0}`,
        `w${Number(user.worker_id) || 0}`,
        `c${String(user.worker_code || "-").trim() || "-"}`,
        `s${getAuthSessionId() || "-"}`
    ].join(":");
}

export function getStoredUser(): AuthUser | null {
    const rawUser = readAuthValue(USER_KEY);
    if (!rawUser) return null;

    try {
        const user = JSON.parse(rawUser) as AuthUser;
        setSessionCacheScope(cacheScopeForUser(user));
        return user;
    } catch {
        removeAuthValue(USER_KEY);
        return null;
    }
}

export function setStoredUser(user: AuthUser): void {
    authStorage().setItem(
        USER_KEY,
        JSON.stringify({
            ...user,
            worker_id: user.worker_id ?? null,
            worker_code: user.worker_code?.trim() || null
        })
    );
    if (!isElectronRuntime()) localStorage.removeItem(USER_KEY);
    setSessionCacheScope(cacheScopeForUser(user));
}

export function saveAuthSession(data: {
    accessToken: string;
    refreshToken?: string;
    user?: AuthUser;
    sessionId?: string;
}): void {
    setAccessToken(data.accessToken);
    if (data.sessionId) setAuthSessionId(data.sessionId);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    if (data.user) setStoredUser(data.user);
    markRefreshSessionAvailable();
}


/**
 * Clears only authentication state owned by the current browser tab.
 *
 * Web refresh cookies and the auth epoch live outside sessionStorage and are
 * intentionally preserved here. This is used when another tab switches
 * accounts: the stale tab must stop using its old access token immediately,
 * without deleting the new account's shared HttpOnly refresh session.
 */
export function clearCurrentTabAuthSession(): void {
    clearSessionCache();
    setSessionCacheScope("anonymous");

    for (const key of [
        "auth",
        "authUser",
        "currentUser",
        ACCESS_TOKEN_KEY,
        LEGACY_TOKEN_KEY,
        USER_KEY,
        AUTH_SESSION_ID_KEY,
        REFRESH_TOKEN_KEY
    ]) {
        sessionStorage.removeItem(key);
    }

    // Old web builds may have left access/user values in localStorage. They
    // are not used for current web sessions and must not resurrect a stale
    // account after a cross-tab switch. Never remove refresh/session-hint
    // keys here because those belong to the newly active shared web session.
    if (!isElectronRuntime()) {
        for (const key of [
            "auth",
            "authUser",
            "currentUser",
            ACCESS_TOKEN_KEY,
            LEGACY_TOKEN_KEY,
            USER_KEY
        ]) {
            localStorage.removeItem(key);
        }
    }

    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ktc:tab-auth-cleared"));
    }
}

export function clearAuthSession(options: { bumpEpoch?: boolean } = {}): void {
    clearSessionCache();
    setSessionCacheScope("anonymous");
    if (options.bumpEpoch !== false) bumpAuthEpoch();

    for (const key of [
        "auth",
        "authUser",
        "currentUser",
        ACCESS_TOKEN_KEY,
        LEGACY_TOKEN_KEY,
        REFRESH_TOKEN_KEY,
        USER_KEY,
        AUTH_SESSION_ID_KEY,
        REFRESH_SESSION_HINT_KEY,
    ]) {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
    }

    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ktc:auth-cleared"));
    }
}

export function hasAuthSession(): boolean {
    return Boolean(getAccessToken() || getRefreshToken());
}
