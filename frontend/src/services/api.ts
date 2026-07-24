import axios, {
    AxiosHeaders
} from "axios";

import type {
    AxiosError,
    InternalAxiosRequestConfig
} from "axios";

import {
    clearAuthSession,
    getAccessToken,
    getRefreshToken,
    saveAuthSession
} from "../utils/authStorage";

import type {
    AuthUser
} from "../utils/authStorage";

const API_BASE_URL =
    import.meta.env.VITE_API_URL ||
    "https://worker-management-system-2-5jqv.onrender.com/api";

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        "Content-Type": "application/json"
    }
});

interface RetryableRequestConfig
    extends InternalAxiosRequestConfig {
    _retry?: boolean;
}

interface RefreshResponse {
    success: boolean;
    token?: string;
    accessToken?: string;
    expiresIn?: string;
    user?: AuthUser;
}

let isRefreshing = false;

let refreshSubscribers: Array<
    (accessToken: string | null) => void
> = [];

function subscribeTokenRefresh(
    callback: (accessToken: string | null) => void
): void {
    refreshSubscribers.push(callback);
}

function notifyTokenRefreshed(
    accessToken: string | null
): void {
    refreshSubscribers.forEach((callback) => {
        callback(accessToken);
    });

    refreshSubscribers = [];
}

function redirectToLogin(): void {
    const currentPath =
        window.location.pathname +
        window.location.search;

    if (!window.location.pathname.includes("/login")) {
        sessionStorage.setItem(
            "redirectAfterLogin",
            currentPath
        );

        window.location.href = "/login";
    }
}

api.interceptors.request.use(
    (
        config: InternalAxiosRequestConfig
    ): InternalAxiosRequestConfig => {
        const accessToken = getAccessToken();

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
    (error: AxiosError) => {
        return Promise.reject(error);
    }
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

        const responseStatus =
            error.response?.status;

        const requestUrl =
            originalRequest.url || "";

        const isAuthRequest =
            requestUrl.includes("/auth/login") ||
            requestUrl.includes("/auth/refresh") ||
            requestUrl.includes("/auth/logout");

        if (
            responseStatus !== 401 ||
            originalRequest._retry ||
            isAuthRequest
        ) {
            return Promise.reject(error);
        }

        const refreshToken = getRefreshToken();

        if (!refreshToken) {
            clearAuthSession();
            redirectToLogin();

            return Promise.reject(error);
        }

        originalRequest._retry = true;

        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                subscribeTokenRefresh(
                    (newAccessToken) => {
                        if (!newAccessToken) {
                            reject(error);
                            return;
                        }

                        if (!originalRequest.headers) {
                            originalRequest.headers =
                                new AxiosHeaders();
                        }

                        originalRequest.headers.set(
                            "Authorization",
                            `Bearer ${newAccessToken}`
                        );

                        resolve(api(originalRequest));
                    }
                );
            });
        }

        isRefreshing = true;

        try {
            const response =
                await axios.post<RefreshResponse>(
                    `${API_BASE_URL}/auth/refresh`,
                    {
                        refreshToken
                    },
                    {
                        timeout: 30000,
                        headers: {
                            "Content-Type":
                                "application/json"
                        }
                    }
                );

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

            notifyTokenRefreshed(
                newAccessToken
            );

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
            notifyTokenRefreshed(null);
            clearAuthSession();
            redirectToLogin();

            return Promise.reject(
                refreshError
            );
        } finally {
            isRefreshing = false;
        }
    }
);

export default api;