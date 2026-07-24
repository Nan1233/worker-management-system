export interface AuthUser {
    id: number;
    worker_id?: number | null;
    username: string;
    full_name: string;
    role: "admin" | "manager" | "lead" | "worker";
}

const ACCESS_TOKEN_KEY = "accessToken";
const LEGACY_TOKEN_KEY = "token";
const REFRESH_TOKEN_KEY = "refreshToken";
const USER_KEY = "user";

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
                user.worker_id ?? null
        })
    );
}

export function saveAuthSession(data: {
    accessToken: string;
    refreshToken?: string;
    user?: AuthUser;
}): void {
    setAccessToken(data.accessToken);

    if (data.refreshToken) {
        setRefreshToken(
            data.refreshToken
        );
    }

    if (data.user) {
        setStoredUser(data.user);
    }
}

export function clearAuthSession(): void {
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
}

export function hasAuthSession(): boolean {
    return Boolean(
        getAccessToken() ||
        getRefreshToken()
    );
}