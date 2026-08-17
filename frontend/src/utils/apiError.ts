import axios from "axios";

export type ApiFieldErrors = Record<string, string>;

export const getApiError = (error: unknown, fallback = "Đã xảy ra lỗi") => {
    if (!axios.isAxiosError(error)) {
        return {
            message: error instanceof Error ? error.message : fallback,
            errors: {} as ApiFieldErrors,
        };
    }

    if (!error.response) {
        return {
            message: error.code === "ECONNABORTED"
                ? "Máy chủ phản hồi quá lâu. Báo cáo chưa được xác nhận lưu, vui lòng kiểm tra lại trước khi gửi lại."
                : "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.",
            errors: {} as ApiFieldErrors,
        };
    }

    const data = error.response.data as {
        message?: string;
        error?: string | { message?: string; code?: string; details?: unknown };
        code?: string;
        errors?: ApiFieldErrors;
        details?: Record<string, unknown>;
    } | undefined;

    const nestedErrorMessage = typeof data?.error === "object"
        ? data.error?.message
        : typeof data?.error === "string"
            ? data.error
            : undefined;

    const fieldErrors = data?.errors || {};
    const firstFieldError = Object.values(fieldErrors).find(Boolean);
    const details = data?.details && typeof data.details === "object"
        ? Object.entries(data.details)
            .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join(" · ")
        : "";

    const status = error.response.status;
    let message = data?.message || nestedErrorMessage || firstFieldError || fallback;

    if (status === 422) {
        message = data?.message || nestedErrorMessage || firstFieldError || "Dữ liệu báo cáo chưa hợp lệ. Vui lòng kiểm tra lại máy, sản phẩm và sản lượng.";
        if (details && !message.includes(details)) message = `${message} (${details})`;
    } else if (status === 409) {
        message = data?.message || nestedErrorMessage || "Báo cáo bị trùng hoặc đã được xử lý. Vui lòng kiểm tra danh sách báo cáo.";
    } else if (status === 429) {
        message = data?.message || nestedErrorMessage || "Hệ thống đang nhận quá nhiều yêu cầu. Dữ liệu trên form vẫn được giữ, vui lòng thử lại sau.";
    } else if (status >= 500) {
        message = data?.message || nestedErrorMessage || "Máy chủ đang bận. Báo cáo chưa được xác nhận lưu, vui lòng thử lại sau.";
    }

    return { message, errors: fieldErrors };
};
