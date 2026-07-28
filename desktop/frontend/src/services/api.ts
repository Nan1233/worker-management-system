import axios, {
    AxiosHeaders
} from "axios";

import type {
    AxiosError,
    InternalAxiosRequestConfig
} from "axios";

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "../config/env";

import {
    clearAuthSession,
    getAccessToken,
    getRefreshToken,
    saveAuthSession
} from "../utils/authStorage";

import type {
    AuthUser
} from "../utils/authStorage";

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
        "Content-Type": "application/json"
    }
});

interface RetryableRequestConfig
    extends InternalAxiosRequestConfig {
    _retry?: boolean;
    _skipProactiveRefresh?: boolean;
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
let transientRefreshBlockedUntil = 0;
let redirectingToLogin = false;

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

    const currentPath =
        window.location.pathname +
        window.location.search;

    if (!window.location.pathname.includes("/login")) {
        sessionStorage.setItem(
            "redirectAfterLogin",
            currentPath
        );

        window.location.replace("/login");
    }
}

function invalidateSessionAndRedirect(): void {
    clearAuthSession();
    redirectToLogin();
}

async function refreshAccessToken(
    force = false
): Promise<string> {
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

    if (!refreshToken) {
        invalidateSessionAndRedirect();
        throw new Error("Không có refresh token");
    }

    refreshPromise = axios
        .post<RefreshResponse>(
            `${API_BASE_URL}/auth/refresh`,
            { refreshToken },
            {
                timeout: REFRESH_REQUEST_TIMEOUT_MS,
                headers: {
                    "Content-Type": "application/json"
                }
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

            saveAuthSession({
                accessToken: newAccessToken,
                user: response.data.user
            });

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
        });

    return refreshPromise;
}

api.interceptors.request.use(
    async (
        config: InternalAxiosRequestConfig
    ): Promise<InternalAxiosRequestConfig> => {
        const retryableConfig =
            config as RetryableRequestConfig;
        let accessToken = getAccessToken();
        const refreshToken = getRefreshToken();

        if (
            accessToken &&
            refreshToken &&
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

        if (accessToken) {
            if (!config.headers) {
                config.headers = new AxiosHeaders();
            }

            config.headers.set(
                "Authorization",
                `Bearer ${accessToken}`
            );
        }

        return config;
    },
    (error: AxiosError) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest =
            error.config as
                | RetryableRequestConfig
                | undefined;

        if (!originalRequest) {
            return Promise.reject(error);
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
            isAuthRequest
        ) {
            return Promise.reject(error);
        }

        if (!getRefreshToken()) {
            invalidateSessionAndRedirect();
            return Promise.reject(error);
        }

        originalRequest._retry = true;
        originalRequest._skipProactiveRefresh = true;

        try {
            const newAccessToken =
                await refreshAccessToken(true);

            if (!originalRequest.headers) {
                originalRequest.headers =
                    new AxiosHeaders();
            }

            originalRequest.headers.set(
                "Authorization",
                `Bearer ${newAccessToken}`
            );

            return api(originalRequest);
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
        if (!getRefreshToken()) return;

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
    window.addEventListener("online", scheduleConnectionRestore);

    window.addEventListener("offline", () => {
        window.dispatchEvent(
            new CustomEvent("ktc:connection-lost")
        );
    });
}

export default api;
