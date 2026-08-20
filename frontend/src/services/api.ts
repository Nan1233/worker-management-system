import axios, {
    AxiosHeaders
} from "axios";

import type {
    AxiosError,
    InternalAxiosRequestConfig
} from "axios";

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "../config/env";
import {
    isRetryableTransientFailure,
    transientRetryDelayMs,
    waitForTransientRetry,
} from "../utils/transientRequestPolicy";
import { emitRequestRetry } from "./requestRecoveryEvents";
import {
    AUTH_EPOCH_CHANGED_EVENT,
    CONNECTION_LOST_EVENT,
    CONNECTION_RESTORED_EVENT,
} from "./authRuntimeEvents";

import {
    bumpAuthEpoch,
    clearAuthSession,
    clearCurrentTabAuthSession,
    clearLegacyRefreshToken,
    getAccessToken,
    getAuthEpoch,
    getAuthSessionId,
    getStoredUser,
    getRefreshToken,
    hasRefreshSessionHint,
    isElectronRuntime,
    saveAuthSession,
    setRefreshToken
} from "../utils/authStorage";

import type {
    AuthUser
} from "../utils/authStorage";

import { containsMojibake } from "../utils/encodingGuard";

import {
    coordinateBrowserRefresh,
    type CoordinatedRefreshFailure,
    type CoordinatedRefreshSuccess
} from "./authRefreshCoordinator";

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
    _transientRetryCount?: number;
}

interface RefreshResponse {
    success: boolean;
    token?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: string;
    user?: AuthUser;
}

const TOKEN_REFRESH_LEEWAY_MS = 2 * 60 * 1000;
const REFRESH_REQUEST_TIMEOUT_MS = 90_000;
const TRANSIENT_REFRESH_COOLDOWN_MS = 10_000;
const CROSS_TAB_LOGIN_MARKER_KEY = "ktcCrossTabAuthInvalidated";

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
        data?.code === "REFRESH_TOKEN_REUSE_DETECTED" ||
        data?.code === "REFRESH_TOKEN_RELOGIN_REQUIRED" ||
        data?.code === "SESSION_USER_DISABLED" ||
        data?.code === "REFRESH_TOKEN_EXPIRED" ||
        data?.code === "REFRESH_TOKEN_REVOKED"
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

function classifyRefreshFailure(error: unknown): CoordinatedRefreshFailure {
    if (isConfirmedInvalidRefresh(error)) {
        const data = axios.isAxiosError(error) ? error.response?.data as { code?: string; message?: string } | undefined : undefined;
        return { kind: "auth", code: data?.code, message: data?.message };
    }
    return { kind: "transient", message: error instanceof Error ? error.message : "Refresh tạm thời thất bại" };
}

async function performNetworkRefresh(): Promise<CoordinatedRefreshSuccess> {
    const refreshToken = getRefreshToken();
    const generationAtStart = authGeneration;
    const epochAtStart = getAuthEpoch();
    const sessionIdAtStart = getAuthSessionId();

    refreshAbortController = new AbortController();
    const response = await axios.post<RefreshResponse>(
        `${API_BASE_URL}/auth/refresh`,
        refreshToken ? { refreshToken } : {},
        {
            timeout: REFRESH_REQUEST_TIMEOUT_MS,
            withCredentials: true,
            headers: { "Content-Type": "application/json" },
            signal: refreshAbortController.signal
        }
    );

    const newAccessToken = response.data.accessToken || response.data.token;
    if (!newAccessToken) throw new Error("Backend không trả về access token mới");

    if (
        generationAtStart !== authGeneration ||
        epochAtStart !== getAuthEpoch() ||
        loginTransitionActive ||
        (refreshToken && refreshToken !== getRefreshToken()) ||
        sessionIdAtStart !== getAuthSessionId()
    ) {
        throw new axios.CanceledError("Kết quả refresh thuộc phiên cũ đã bị bỏ qua.");
    }

    const currentUser = getStoredUser();
    const refreshedUser = response.data.user;
    if (currentUser && refreshedUser && currentUser.id !== refreshedUser.id) {
        clearCurrentTabAuthSession();
        throw new axios.CanceledError("Phiên làm mới thuộc tài khoản khác. Tab hiện tại đã được đăng xuất.");
    }

    if (isElectronRuntime()) {
        if (!response.data.refreshToken) {
            throw new Error("ELECTRON_REFRESH_TOKEN_SUCCESSOR_MISSING");
        }
        try {
            setRefreshToken(response.data.refreshToken);
        } catch {
            clearAuthSession();
            redirectToLogin();
            throw new Error("ELECTRON_REFRESH_TOKEN_PERSIST_FAILED");
        }
    }

    saveAuthSession({
        accessToken: newAccessToken,
        user: refreshedUser,
        sessionId: sessionIdAtStart || undefined
    });
    clearLegacyRefreshToken();

    return {
        accessToken: newAccessToken,
        user: refreshedUser
    };
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

    if (!force && Date.now() < transientRefreshBlockedUntil) {
        throw new Error("Backend đang khởi động lại. Giữ nguyên phiên đăng nhập.");
    }

    const coordinatedRefresh = async (): Promise<string> => {
        try {
            const result = isElectronRuntime()
                ? await performNetworkRefresh()
                : await coordinateBrowserRefresh(performNetworkRefresh, classifyRefreshFailure);
            transientRefreshBlockedUntil = 0;
            redirectingToLogin = false;
            return result.accessToken;
        } catch (error) {
            if (isConfirmedInvalidRefresh(error)) {
                invalidateSessionAndRedirect();
            } else {
                transientRefreshBlockedUntil = Date.now() + TRANSIENT_REFRESH_COOLDOWN_MS;
            }
            throw error;
        } finally {
            refreshAbortController = null;
        }
    };

    refreshPromise = coordinatedRefresh()
        .finally(() => {
            refreshPromise = null;
        });

    return refreshPromise;
}

export function isAuthRefreshInProgress(): boolean {
    return Boolean(refreshPromise);
}

export async function initializeAuthSession(): Promise<void> {
    if (loginTransitionActive) return;
    const currentRoute = window.location.hash.replace(/^#/, "") || "/";
    if (/^\/login(?:\/|$)/.test(currentRoute)) return;

    const accessToken = getAccessToken();
    const refreshToken = getRefreshToken();
    const canRestoreSession = Boolean(
        accessToken ||
        refreshToken ||
        hasRefreshSessionHint()
    );

    // May chua tung co phien dang nhap: khong probe /auth/refresh.
    if (!canRestoreSession) return;

    if (!accessToken || shouldRefreshAccessToken(accessToken)) {
        try {
            await refreshAccessToken(true);
        } catch (error) {
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
            String(import.meta.env.VITE_BUILD_VERSION || "1.8.22")
        );

        return config;
    },
    (error: AxiosError) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => {
        if (
            import.meta.env.DEV &&
            containsMojibake(response.data)
        ) {
            console.warn(
                "[KTC] API response contains possible UTF-8 mojibake. " +
                "Check backend response encoding/data source.",
                response.config?.url
            );
        }

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

        const transientRetryCount =
            originalRequest._transientRetryCount || 0;
        const retryAfterHeader =
            error.response?.headers?.["retry-after"] ??
            null;

        if (
            isRetryableTransientFailure({
                method: originalRequest.method,
                status,
                code: error.code,
                retryCount: transientRetryCount,
                retryAfterHeader: String(retryAfterHeader || "") || null,
            })
        ) {
            const delayMs = transientRetryDelayMs(transientRetryCount);

            originalRequest._transientRetryCount =
                transientRetryCount + 1;

            emitRequestRetry({
                method: String(
                    originalRequest.method || "GET"
                ).toUpperCase(),
                path: requestUrl,
                delayMs,
                status,
            });

            await waitForTransientRetry(delayMs);
            return api.request(originalRequest);
        }
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
        if (/^\/login(?:\/|$)/.test(currentRoute)) return;
        if (!getAccessToken() && !getRefreshToken() && !hasRefreshSessionHint()) return;

        try {
            await refreshAccessToken(true);
            window.dispatchEvent(
                new CustomEvent(CONNECTION_RESTORED_EVENT)
            );
        } catch {
            // Giu nguyen phien; request tiep theo se thu lai.
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

        // authEpoch only changes when another tab logs in/logs out/switches
        // account. Immediately retire this tab's access token so an old user
        // cannot continue making authenticated requests until JWT expiry.
        clearCurrentTabAuthSession();
        sessionStorage.setItem(CROSS_TAB_LOGIN_MARKER_KEY, "1");
        window.dispatchEvent(new CustomEvent(AUTH_EPOCH_CHANGED_EVENT));

        const currentRoute = window.location.hash.replace(/^#/, "") || "/";
        if (!/^\/login(?:\/|$)/.test(currentRoute)) {
            window.location.replace(
                `${window.location.origin}${window.location.pathname}#/login`
            );
        }
    });

    window.addEventListener("online", scheduleConnectionRestore);

    window.addEventListener("offline", () => {
        window.dispatchEvent(
            new CustomEvent(CONNECTION_LOST_EVENT)
        );
    });
}

export default api;
