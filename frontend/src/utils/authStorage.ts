import { clearSessionCache } from "../services/sessionCache";

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
    return localStorage.getItem(AUTH_SESSION_ID_KEY);
}

export function setAuthSessionId(sessionId: string): void {
    localStorage.setItem(AUTH_SESSION_ID_KEY, sessionId);
}

export function createAuthSessionId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getAccessToken(): string | null {
    return (
        localStorage.getItem(ACCESS_TOKEN_KEY) ||
        localStorage.getItem(LEGACY_TOKEN_KEY)
    );
}

export function setAccessToken(
    token: string
): void {
    localStorage.setItem(
        ACCESS_TOKEN_KEY,
        token
    );

    // Giữ tương thích với code cũ.
    localStorage.setItem(
        LEGACY_TOKEN_KEY,
        token
    );
}

export function getRefreshToken(): string | null {
    return localStorage.getItem(
        REFRESH_TOKEN_KEY
    );
}

export function setRefreshToken(
    token: string
): void {
    localStorage.setItem(
        REFRESH_TOKEN_KEY,
        token
    );
}


function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split(".")[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const decoded = decodeURIComponent(
            atob(normalized)
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
export function getStoredUser(): AuthUser | null {
    const rawUser =
        localStorage.getItem(USER_KEY);

    if (!rawUser) {
        return null;
    }

    try {
        return JSON.parse(rawUser) as AuthUser;
    } catch {
        localStorage.removeItem(USER_KEY);
        return null;
    }
}

export function setStoredUser(
    user: AuthUser
): void {
    localStorage.setItem(
        USER_KEY,
        JSON.stringify({
            ...user,
            worker_id:
                user.worker_id ?? null,
            worker_code:
                user.worker_code?.trim() || null
        })
    );
}

export function saveAuthSession(data: {
    accessToken: string;
    refreshToken?: string;
    user?: AuthUser;
    sessionId?: string;
}): void {
    setAccessToken(data.accessToken);

    if (data.sessionId) {
        setAuthSessionId(data.sessionId);
    }

    if (data.refreshToken) {
        setRefreshToken(
            data.refreshToken
        );
    }

    if (data.user) {
        setStoredUser(data.user);
    }
}

export function clearAuthSession(options: { bumpEpoch?: boolean } = {}): void {
    clearSessionCache();
    if (options.bumpEpoch !== false) {
        bumpAuthEpoch();
    }
    localStorage.removeItem("auth");
    localStorage.removeItem("authUser");
    localStorage.removeItem("currentUser");
    localStorage.removeItem(
        ACCESS_TOKEN_KEY
    );

    localStorage.removeItem(
        LEGACY_TOKEN_KEY
    );

    localStorage.removeItem(
        REFRESH_TOKEN_KEY
    );

    localStorage.removeItem(
        USER_KEY
    );

    localStorage.removeItem(AUTH_SESSION_ID_KEY);

    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ktc:auth-cleared"));
    }
}

export function hasAuthSession(): boolean {
    return Boolean(
        getAccessToken() ||
        getRefreshToken()
    );
}