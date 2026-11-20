import { clearSessionCache, setSessionCacheScope } from "../services/sessionCache";

export interface AuthUser {
    id: number;
    worker_id?: number | null;
    worker_code?: string | null;
    username: string;
    full_name: string;
    role: "admin" | "admin_ops" | "manager" | "lead" | "worker";
    // Display hint only; the backend derives super-admin rights from the database on every request.
    is_super_admin?: boolean;
}

const ACCESS_TOKEN_KEY = "accessToken";
const LEGACY_TOKEN_KEY = "token";
const REFRESH_TOKEN_KEY = "refreshToken";
// Normal web sessions never persist a JS-readable refresh token; refresh uses the HttpOnly cookie.
const USER_KEY = "user";
const AUTH_EPOCH_KEY = "ktcAuthEpoch";
const ACTIVE_TAB_OWNER_PREFIX = "ktcActiveAuthTab:";
const runtimeTabId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

function activeTabOwnerKey(): string | null {
    const userId = Number(getStoredUser()?.id);
    return Number.isInteger(userId) && userId > 0 ? ACTIVE_TAB_OWNER_PREFIX + userId : null;
}
/**
 * Only reclaim expired/abandoned KTC authentication coordination metadata
 * when quota is exhausted. Never clear user drafts, app settings, or another
 * tab's currently selected account, and never silently bypass tab ownership.
 */
function reclaimStaleAuthCoordinationKeys(activeKey: string): void {
    try {
        const staleKeys: string[] = [];
        const now = Date.now();
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key || key === activeKey) continue;
            if (key.startsWith("ktcAuthRefreshIntent:")) {
                const raw = localStorage.getItem(key);
                let expiresAt = 0;
                try { expiresAt = Number(JSON.parse(raw || "{}").expiresAt); } catch { /* stale */ }
                if (!Number.isFinite(expiresAt) || expiresAt <= now) staleKeys.push(key);
            } else if (key === "ktcAuthRefreshLock") {
                const raw = localStorage.getItem(key);
                let expiresAt = 0;
                try { expiresAt = Number(JSON.parse(raw || "{}").expiresAt); } catch { /* stale */ }
                if (!Number.isFinite(expiresAt) || expiresAt <= now) staleKeys.push(key);
            } else if (key.startsWith(ACTIVE_TAB_OWNER_PREFIX)) {
                // A different employee/account can be logged in elsewhere.
                // Do not erase its ownership marker just to make space.
            }
        }
        for (const key of staleKeys) localStorage.removeItem(key);
    } catch { /* No destructive fallback when storage enumeration is blocked. */ }
}

export function claimActiveBrowserTab(): void {
    if (supportsElectronRefreshTokenBody()) return;
    const key = activeTabOwnerKey();
    if (!key) return;
    try {
        localStorage.setItem(key, runtimeTabId);
        return;
    } catch (error) {
        if (!(error instanceof DOMException) || (error.name !== "QuotaExceededError"
            && error.name !== "NS_ERROR_DOM_QUOTA_REACHED")) throw error;
    }

    reclaimStaleAuthCoordinationKeys(key);
    try {
        localStorage.setItem(key, runtimeTabId);
    } catch {
        // Explicitly fail closed instead of allowing an untracked browser tab
        // to bypass the project's single-active-tab protection.
        throw new Error("Bộ nhớ trang KTC TEST đã đầy. Hãy xóa dữ liệu trang web KTC TEST (không xóa dữ liệu các trang khác), tải lại và đăng nhập. Tài khoản không bị khóa.");
    }
}
export function isActiveBrowserTab(): boolean {
    if (supportsElectronRefreshTokenBody()) return true;
    const key = activeTabOwnerKey();
    return !key || localStorage.getItem(key) === runtimeTabId;
}
export const ACTIVE_AUTH_TAB_KEY = ACTIVE_TAB_OWNER_PREFIX;
const AUTH_SESSION_ID_KEY = "ktcAuthSessionId";
const REFRESH_SESSION_HINT_KEY = "ktcRefreshSessionHint";

let pendingPreviousRefreshTokenForLogin: string | null = null;

export function isElectronRuntime(): boolean {
    return typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent);
}

/**
 * The login API may accept a previous refresh token in the request body only
 * for Electron's opaque/native origin. HTTP(S) clients must use the HttpOnly
 * refresh cookie and must never send this credential through JavaScript.
 */
export function supportsElectronRefreshTokenBody(): boolean {
    if (!isElectronRuntime() || typeof window === "undefined") return false;
    const origin = String(window.location.origin || "").trim().toLowerCase();
    return !origin || origin === "null" || origin.startsWith("file:");
}

/** Preserve the Electron token in memory before login-page cleanup removes it. */
export function preservePreviousRefreshTokenForLogin(): void {
    if (!supportsElectronRefreshTokenBody() || pendingPreviousRefreshTokenForLogin) return;
    const token = getRefreshToken();
    if (token) pendingPreviousRefreshTokenForLogin = token;
}

export function getPreviousRefreshTokenForLogin(): string | null {
    return supportsElectronRefreshTokenBody() ? pendingPreviousRefreshTokenForLogin : null;
}

export function clearPreviousRefreshTokenForLogin(): void {
    pendingPreviousRefreshTokenForLogin = null;
}

/** Browser access tokens are tab-scoped; Electron retains native persistence. */
function authStorage(): Storage {
    return supportsElectronRefreshTokenBody() ? localStorage : sessionStorage;
}

function readAuthValue(key: string, legacyKey?: string): string | null {
    const store = authStorage();
    const current = store.getItem(key) || (legacyKey ? store.getItem(legacyKey) : null);
    if (!supportsElectronRefreshTokenBody()) {
        // Retire persistent browser/hosted-Electron credentials from older versions.
        localStorage.removeItem(key);
        if (legacyKey) localStorage.removeItem(legacyKey);
    }
    return current;
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
    if (store !== sessionStorage) {
        sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        sessionStorage.removeItem(LEGACY_TOKEN_KEY);
    }
}

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
    if (supportsElectronRefreshTokenBody()) {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    }
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    return null;
}

export function setRefreshToken(token: string): void {
    if (supportsElectronRefreshTokenBody()) {
        localStorage.setItem(REFRESH_TOKEN_KEY, token);
        return;
    }
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearLegacyRefreshToken(): void {
    if (supportsElectronRefreshTokenBody()) return;
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
    if (!["admin", "admin_ops", "manager", "lead", "worker"].includes(role)) return null;
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
        role: role as AuthUser["role"],
        is_super_admin: payload.is_super_admin === true
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
    if (authStorage() !== sessionStorage) sessionStorage.removeItem(USER_KEY);
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
    claimActiveBrowserTab();
}

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

    // Access token and user are stored in localStorage and shared by same-origin tabs.
    // Never remove refresh/session-hint in this tab-only cleanup. A stale tab must not delete the newer tab's session. This function retires
    // only this renderer's tab-scoped state; clearAuthSession() remains the
    // explicit global logout/account-retirement operation.

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
