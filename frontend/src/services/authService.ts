import api, { refreshAccessToken } from "./api";
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
    const response =
        await api.post<LoginResponse>(
            "/auth/login",
            {
                username,
                access_type: accessType,
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