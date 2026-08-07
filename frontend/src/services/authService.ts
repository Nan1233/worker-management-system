import axios from "axios";
import api, { beginLoginTransition, finishLoginTransition, refreshAccessToken } from "./api";
import type {
    LoginResponse
} from "../types/auth";
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "../config/env";

import {
    clearAuthSession,
    createAuthSessionId,
    getAuthEpoch,
    getRefreshToken,
    saveAuthSession
} from "../utils/authStorage";

import type {
    AuthUser
} from "../utils/authStorage";

interface RefreshResponse {
    success: boolean;
    message: string;
    token?: string;
    accessToken?: string;
    expiresIn?: string;
    user?: AuthUser;
}

export type LoginAccessType =
    | "worker"
    | "management";

export const login = async (
    username: string,
    accessType: LoginAccessType,
    password = ""
): Promise<LoginResponse> => {
    const previousRefreshToken = getRefreshToken();
    const loginEpoch = beginLoginTransition();
    clearAuthSession({ bumpEpoch: false });
    const loginSessionId = createAuthSessionId();

    try {
        // Dùng axios độc lập để request login không đi qua interceptor/token
        // của tài khoản trước.
        const response = await axios.post<LoginResponse>(
            `${API_BASE_URL}/auth/login`,
            {
                username,
                access_type: accessType,
                password,
                previous_refresh_token: previousRefreshToken || undefined
            },
            {
                timeout: REQUEST_TIMEOUT_MS,
                headers: { "Content-Type": "application/json" }
            }
        );

        if (getAuthEpoch() !== loginEpoch) {
            throw new axios.CanceledError("Lần đăng nhập đã bị thay thế bởi một phiên mới hơn.");
        }

        const data = response.data;
        const accessToken = data.accessToken || data.token;

        if (!accessToken) {
            throw new Error("Backend không trả về access token");
        }

        if (!data.refreshToken) {
            throw new Error("Backend không trả về refresh token");
        }

        saveAuthSession({
            accessToken,
            refreshToken: data.refreshToken,
            sessionId: loginSessionId,
            user: {
                ...data.user,
                worker_id: data.user.worker_id ?? null,
                worker_code: data.user.worker_code?.trim() || null
            }
        });

        return data;
    } catch (error) {
        if (getAuthEpoch() === loginEpoch) {
            clearAuthSession({ bumpEpoch: false });
        }
        throw error;
    } finally {
        finishLoginTransition();
    }
};

export const refreshSession = async (): Promise<RefreshResponse> => {
    const accessToken = await refreshAccessToken(true);
    return { success: true, message: "Phiên đã được làm mới", accessToken };
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