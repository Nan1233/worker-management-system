import axios from "axios";

import api from "../api/axios";

import type {
    LoginResponse
} from "../types/auth";

import {
    clearAuthSession,
    getRefreshToken,
    saveAuthSession
} from "../utils/authStorage";

import type {
    AuthUser
} from "../utils/authStorage";

const API_BASE_URL =
    import.meta.env.VITE_API_URL ||
    "https://worker-management-system-2-5jqv.onrender.com/api";

interface RefreshResponse {
    success: boolean;
    message: string;
    token?: string;
    accessToken?: string;
    expiresIn?: string;
    user?: AuthUser;
}

export const login = async (
    username: string,
    password: string
): Promise<LoginResponse> => {
    const response =
        await api.post<LoginResponse>(
            "/auth/login",
            {
                username,
                password
            }
        );

    const data = response.data;

    const accessToken =
        data.accessToken || data.token;

    if (!accessToken) {
        throw new Error(
            "Backend không trả về access token"
        );
    }

    if (!data.refreshToken) {
        throw new Error(
            "Backend không trả về refresh token"
        );
    }

    saveAuthSession({
        accessToken,
        refreshToken: data.refreshToken,
        user: {
            ...data.user,
            worker_id:
                data.user.worker_id ?? null
        }
    });

    return data;
};

export const refreshSession =
    async (): Promise<RefreshResponse> => {
        const refreshToken =
            getRefreshToken();

        if (!refreshToken) {
            throw new Error(
                "Không có refresh token"
            );
        }

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

        const accessToken =
            response.data.accessToken ||
            response.data.token;

        if (!accessToken) {
            throw new Error(
                "Không nhận được access token mới"
            );
        }

        saveAuthSession({
            accessToken,
            user: response.data.user
                ? {
                      ...response.data.user,
                      worker_id:
                          response.data.user
                              .worker_id ?? null
                  }
                : undefined
        });

        return response.data;
    };

export const logout =
    async (): Promise<void> => {
        const refreshToken =
            getRefreshToken();

        try {
            if (refreshToken) {
                await api.post(
                    "/auth/logout",
                    {
                        refreshToken
                    }
                );
            }
        } catch (error) {
            console.error(
                "Không thể đăng xuất trên server:",
                error
            );
        } finally {
            clearAuthSession();
        }
    };