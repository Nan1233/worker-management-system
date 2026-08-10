import axios, {
    AxiosHeaders
} from "axios";

import type {
    AxiosError,
    InternalAxiosRequestConfig
} from "axios";

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "../config/env";

import {
    bumpAuthEpoch,
    clearAuthSession,
    clearLegacyRefreshToken,
    getAccessToken,
    getAuthEpoch,
    getAuthSessionId,
    getRefreshToken,
    saveAuthSession
} from "../utils/authStorage";

import type {
    AuthUser
} from "../utils/authStorage";

export const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
        "Content-Type": "application/json"
    },
    withCredentials: true
});

interface RetryableRequestConfig
    extends InternalAxiosRequestConfig {
    _retry?: boolean;
    _skipProactiveRefresh?: boolean;
    _authGeneration?: number;
}

interface RefreshResponse {
    success: boolean;
    token?: string;
    accessToken?: string;
    expiresIn?: string;
    user?: AuthUser;
}

const TOKEN_REFRESH_LEEWAY_MS = 2 * 60 * 1000;
const REFRESH_REQUEST_TIMEOUT_MS = 90_000;
const TRANSIENT_REFRESH_COOLDOWN_MS = 10_000;

let refreshPromise: Promise<string> | null = null;
let refreshAbortController: AbortController | null = null;
let authGeneration = getAuthEpoch();
let loginTransitionActive = false;
let transientRefreshBlockedUntil = 0;
let redirectingToLogin = false;

export function beginLoginTransition(): number {
    loginTransitionActive = true;
    authGeneration = bumpAuthEpoch();
    refreshAbortController?.abort();
    refreshAbortController = null;
    refreshPromise = null;
    transientRefreshBlockedUntil = 0;
    return authGeneration;
}

export function finishLoginTransition(): void {
    loginTransitionActive = false;
}

export function isLoginTransitionActive(): boolean {
    return loginTransitionActive;
}

export function getAuthGeneration(): number {
    return authGeneration;
}

function staleSessionError(): Error {
    return new axios.CanceledError("Phản hồi thuộc phiên đăng nhập cũ đã bị hủy.");
}

function decodeJwtExpiration(token: string): number | null {
    try {
        const payloadPart = token.split(".")[1];
        if (!payloadPart) return null;

        const normalized = payloadPart
            .replace(/-/g, "+")
            .replace(/_/g, "/");
        const padded = normalized.padEnd(
            Math.ceil(normalized.length / 4) * 4,
            "="
        );
        const payload = JSON.parse(atob(padded)) as {
            exp?: number;
        };

        return Number.isFinite(payload.exp)
            ? Number(payload.exp) * 1000
            : null;
    } catch {
        return null;
    }
}

function isAccessTokenExpired(token: string): boolean {
    const expiresAt = decodeJwtExpiration(token);
    return Boolean(expiresAt && expiresAt <= Date.now());
}

function shouldRefreshAccessToken(token: string): boolean {
    const expiresAt = decodeJwtExpiration(token);

    if (!expiresAt) {
        return false;
    }

    return expiresAt - Date.now() <= TOKEN_REFRESH_LEEWAY_MS;
}

function isConfirmedInvalidRefresh(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;

    const status = error.response?.status;
    const data = error.response?.data as
        | { code?: string }
        | undefined;

    return (
        status === 400 ||
        status === 401 ||
        status === 403 ||
        data?.code === "REFRESH_TOKEN_INVALID" ||
        data?.code === "REFRESH_TOKEN_EXPIRED"
    );
}

function redirectToLogin(): void {
    if (redirectingToLogin) return;

    redirectingToLogin = true;

    const currentRoute = window.location.hash.replace(/^#/, "") || "/";

    if (!/^\/login(?:\/|$)/.test(currentRoute)) {
        sessionStorage.setItem("redirectAfterLogin", currentRoute);
        window.location.replace(`${window.location.origin}${window.location.pathname.replace(/\/login\/?$/, "/")}#/login`);
    }
}

function invalidateSessionAndRedirect(): void {
    clearAuthSession();
    redirectToLogin();
}

export async function refreshAccessToken(
    force = false
): Promise<string> {
    if (loginTransitionActive) {
        throw new Error("Đang chuyển tài khoản, tạm dừng làm mới phiên cũ.");
    }

    if (refreshPromise) {
        return refreshPromise;
    }

    if (
        !force &&
        Date.now() < transientRefreshBlockedUntil
    ) {
        throw new Error(
            "Backend đang khởi động lại. Giữ nguyên phiên đăng nhập."
        );
    }

    const refreshToken = getRefreshToken();
    const generationAtStart = authGeneration;
    const epochAtStart = getAuthEpoch();
    const sessionIdAtStart = getAuthSessionId();

    // Web dùng HttpOnly refresh cookie; Electron vẫn có body-token fallback.
    refreshAbortController = new AbortController();

    refreshPromise = axios
        .post<RefreshResponse>(
            `${API_BASE_URL}/auth/refresh`,
            refreshToken ? { refreshToken } : {},
            {
                timeout: REFRESH_REQUEST_TIMEOUT_MS,
                withCredentials: true,
                headers: {
                    "Content-Type": "application/json"
                },
                signal: refreshAbortController.signal
            }
        )
        .then((response) => {
            const newAccessToken =
                response.data.accessToken ||
                response.data.token;

            if (!newAccessToken) {
                throw new Error(
                    "Backend không trả về access token mới"
                );
            }

            if (
                generationAtStart !== authGeneration ||
                epochAtStart !== getAuthEpoch() ||
                loginTransitionActive ||
                (refreshToken && refreshToken !== getRefreshToken()) ||
                sessionIdAtStart !== getAuthSessionId()
            ) {
                throw new axios.CanceledError(
                    "Kết quả refresh thuộc phiên cũ đã bị bỏ qua."
                );
            }

            saveAuthSession({
                accessToken: newAccessToken,
                user: response.data.user,
                sessionId: sessionIdAtStart || undefined
            });

            clearLegacyRefreshToken();
            transientRefreshBlockedUntil = 0;
            redirectingToLogin = false;

            return newAccessToken;
        })
        .catch((error: unknown) => {
            if (isConfirmedInvalidRefresh(error)) {
                invalidateSessionAndRedirect();
            } else {
                // Render deploy/cold start, timeout, mất mạng hoặc lỗi 5xx:
                // giữ nguyên localStorage và thử lại ở request sau.
                transientRefreshBlockedUntil =
                    Date.now() +
                    TRANSIENT_REFRESH_COOLDOWN_MS;
            }

            throw error;
        })
        .finally(() => {
            refreshPromise = null;
            refreshAbortController = null;
        });

    return refreshPromise;
}

export function isAuthRefreshInProgress(): boolean {
    return Boolean(refreshPromise);
}

export async function initializeAuthSession(): Promise<void> {
    if (loginTransitionActive) return;
    const currentRoute = window.location.hash.replace(/^#/, "") || "/";
    if (currentRoute === "/" || /^\/login(?:\/|$)/.test(currentRoute)) return;

    const accessToken = getAccessToken();
    // Web refresh sessions live in an HttpOnly cookie, so the absence of a
    // JavaScript-visible refresh token does not mean there is no session.
    // Electron may still provide a body-token fallback.
    if (!accessToken || shouldRefreshAccessToken(accessToken)) {
        try { await refreshAccessToken(true); } catch (error) {
            if (isConfirmedInvalidRefresh(error)) throw error;
        }
    }
}

api.interceptors.request.use(
    async (
        config: InternalAxiosRequestConfig
    ): Promise<InternalAxiosRequestConfig> => {
        const retryableConfig =
            config as RetryableRequestConfig;
        authGeneration = getAuthEpoch();
        retryableConfig._authGeneration = authGeneration;
        const requestUrl = config.url || "";
        const isAuthRequest =
            requestUrl.includes("/auth/login") ||
            requestUrl.includes("/auth/refresh") ||
            requestUrl.includes("/auth/logout");
        let accessToken = getAccessToken();
        if (
            !loginTransitionActive &&
            !isAuthRequest &&
            accessToken &&
            !retryableConfig._skipProactiveRefresh &&
            shouldRefreshAccessToken(accessToken)
        ) {
            try {
                accessToken = await refreshAccessToken();
            } catch (error) {
                // Nếu token đã hết hạn thì tuyệt đối không gửi request bằng
                // token cũ, vì sẽ tạo bão 401 trong lúc Render deploy/chuyển mạng.
                // Giữ nguyên phiên đăng nhập và chờ sự kiện online/reconnect.
                if (isAccessTokenExpired(accessToken)) {
                    return Promise.reject(error);
                }
                // Token chỉ sắp hết hạn nhưng vẫn còn hợp lệ: cho request hiện
                // tại tiếp tục; lần sau hệ thống sẽ thử refresh lại.
            }
        }

        config.headers = AxiosHeaders.from(config.headers || {});
        config.headers.delete("Authorization");

        if (accessToken && !isAuthRequest) {
            // Luôn ghi đè bằng token mới nhất trong storage. Không giữ token
            // đã được gắn vào config trước khi refresh hoàn tất.
            config.headers.set("Authorization", `Bearer ${accessToken}`);
        }

        config.headers.set(
            "X-Frontend-Version",
            String(import.meta.env.VITE_BUILD_VERSION || "1.5.0")
        );

        return config;
    },
    (error: AxiosError) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => {
        const requestConfig = response.config as RetryableRequestConfig;
        if (
            requestConfig._authGeneration !== undefined &&
            requestConfig._authGeneration !== authGeneration
        ) {
            return Promise.reject(staleSessionError());
        }
        return response;
    },
    async (error: AxiosError) => {
        const originalRequest =
            error.config as
                | RetryableRequestConfig
                | undefined;

        if (!originalRequest) {
            return Promise.reject(error);
        }

        if (
            originalRequest._authGeneration !== undefined &&
            originalRequest._authGeneration !== authGeneration
        ) {
            return Promise.reject(staleSessionError());
        }

        const status = error.response?.status;
        const requestUrl = originalRequest.url || "";
        const isAuthRequest =
            requestUrl.includes("/auth/login") ||
            requestUrl.includes("/auth/refresh") ||
            requestUrl.includes("/auth/logout");

        if (
            status !== 401 ||
            originalRequest._retry ||
            isAuthRequest ||
            loginTransitionActive
        ) {
            return Promise.reject(error);
        }

        originalRequest._retry = true;
        originalRequest._skipProactiveRefresh = true;

        try {
            const newAccessToken =
                await refreshAccessToken(true);

            originalRequest.headers = AxiosHeaders.from(
                originalRequest.headers || {}
            );
            originalRequest.headers.delete("Authorization");
            originalRequest.headers.set(
                "Authorization",
                `Bearer ${newAccessToken}`
            );

            // Dùng request() để retry đúng config sau khi đã thay token.
            return api.request(originalRequest);
        } catch (refreshError) {
            return Promise.reject(refreshError);
        }
    }
);


// Khi PWA chuyển Wi-Fi/4G, trình duyệt có thể báo online trước khi
// đường truyền thật sự ổn định. Đợi ngắn rồi làm mới token một lần,
// sau đó phát sự kiện để các trang tự tải lại dữ liệu. Không xóa phiên
// nếu lần thử này thất bại do mạng hoặc Render đang khởi động.
let reconnectTimer: number | undefined;

function scheduleConnectionRestore(): void {
    window.clearTimeout(reconnectTimer);

    reconnectTimer = window.setTimeout(async () => {
        if (loginTransitionActive) return;
        const currentRoute = window.location.hash.replace(/^#/, "") || "/";
        if (currentRoute === "/" || /^\/login(?:\/|$)/.test(currentRoute)) return;

        try {
            await refreshAccessToken(true);
            window.dispatchEvent(
                new CustomEvent("ktc:connection-restored")
            );
        } catch {
            // Giữ nguyên phiên; request tiếp theo sẽ thử lại.
        }
    }, 1200);
}

if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
        if (event.key !== "ktcAuthEpoch") return;
        authGeneration = getAuthEpoch();
        refreshAbortController?.abort();
        refreshAbortController = null;
        refreshPromise = null;
        transientRefreshBlockedUntil = 0;
        window.dispatchEvent(new CustomEvent("ktc:auth-epoch-changed"));
    });

    window.addEventListener("online", scheduleConnectionRestore);

    window.addEventListener("offline", () => {
        window.dispatchEvent(
            new CustomEvent("ktc:connection-lost")
        );
    });
}

export default api;
