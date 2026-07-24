import axios from "axios";

export type ApiFieldErrors = Record<string, string>;

export const getApiError = (error: unknown, fallback = "Đã xảy ra lỗi") => {
    if (!axios.isAxiosError(error)) {
        return { message: error instanceof Error ? error.message : fallback, errors: {} as ApiFieldErrors };
    }
    if (!error.response) {
        return { message: "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.", errors: {} as ApiFieldErrors };
    }
    const data = error.response.data as { message?: string; errors?: ApiFieldErrors } | undefined;
    return { message: data?.message || fallback, errors: data?.errors || {} };
};
