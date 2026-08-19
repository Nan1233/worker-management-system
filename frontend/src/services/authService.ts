import axios from "axios";
import api, { beginLoginTransition, finishLoginTransition, refreshAccessToken } from "./api";
import type {
    LoginResponse
} from "../types/auth";
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "../config/env";

import {
    clearAuthSession,
    createAuthSessionId,
    getAccessToken,
    getAuthEpoch,
    getRefreshToken,
    getStoredUser,
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

const LOGIN_RETRY_DELAY_MS = 900;
const RETRYABLE_LOGIN_STATUSES = new Set([408, 425, 500, 502, 503, 504]);

function isRetryableLoginFailure(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    if (!error.response) return true;
    return RETRYABLE_LOGIN_STATUSES.has(Number(error.response.status));
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function postLoginRequest(
    username: string,
    accessType: LoginAccessType,
    password: string,
    previousRefreshToken: string | null
): Promise<LoginResponse> {
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
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
                    withCredentials: true,
                    headers: { "Content-Type": "application/json" }
                }
            );
            return response.data;
        } catch (error) {
            lastError = error;
            if (attempt === 0 && isRetryableLoginFailure(error)) {
                await wait(LOGIN_RETRY_DELAY_MS);
                continue;
            }
            throw error;
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error("Không thể đăng nhập. Vui lòng thử lại.");
}

function assertCommittedLoginSession(userId: number): void {
    const token = getAccessToken();
    const user = getStoredUser();
    if (!token || !user || Number(user.id) !== Number(userId)) {
        throw new Error("Phiên đăng nhập chưa được lưu hoàn tất. Vui lòng thử lại.");
    }
}

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
        // của tài khoản trước. Nếu Render/cellular network vừa thức dậy,
        // tự thử lại đúng 1 lần thay vì bắt người dùng bấm Đăng nhập lần hai.
        const data = await postLoginRequest(
            username,
            accessType,
            password,
            previousRefreshToken
        );

        if (getAuthEpoch() !== loginEpoch) {
            throw new axios.CanceledError("Lần đăng nhập đã bị thay thế bởi một phiên mới hơn.");
        }
        const accessToken = data.accessToken || data.token;

        if (!accessToken) {
            throw new Error("Backend không trả về access token");
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

        // Storage là đồng bộ, nhưng kiểm tra lại ngay trước khi route được đổi
        // để PrivateRoute không thể nhìn thấy một phiên nửa chừng.
        assertCommittedLoginSession(data.user.id);
        window.dispatchEvent(new CustomEvent("ktc:auth-session-saved"));

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
        clearAuthSession();

        try {
            await api.post(
                "/auth/logout",
                refreshToken ? { refreshToken } : {}
            );
        } catch {
            // Local identity is already retired. Server-side expiry/revocation is best-effort.
        } finally {
            clearAuthSession();
        }
    };