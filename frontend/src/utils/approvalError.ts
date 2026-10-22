import axios from "axios";

/**
 * Message for a failed approve/reject call. It keeps the server's message but also appends the HTTP status,
 * the error code and the (short) request id so a manager can quote exactly what failed; the same id is
 * written in the backend request log. Without it a masked 400/500 ("Không thể duyệt báo cáo") cannot be traced.
 */
export function describeApprovalError(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return error instanceof Error && error.message ? error.message : fallback;
  const response = error.response;
  if (!response) {
    return error.code === "ECONNABORTED"
      ? "Máy chủ phản hồi quá lâu. Kết quả duyệt chưa được xác nhận — hãy tải lại danh sách để kiểm tra trước khi thử lại."
      : "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng rồi thử lại.";
  }
  const data = (response.data && typeof response.data === "object" ? response.data : {}) as { message?: unknown; code?: unknown; requestId?: unknown };
  const code = typeof data.code === "string" && data.code ? data.code : "";
  let message = typeof data.message === "string" && data.message.trim() ? data.message.trim() : fallback;
  if (code === "MACHINE_EVENT_REQUIRED") {
    message += " Mở chi tiết báo cáo (bấm vào dòng trong danh sách chờ duyệt) và dùng mục \"Production event máy dùng chung\" để tạo và duyệt sự kiện máy trước.";
  }
  // The body carries the id (cross-origin browsers cannot read X-Request-Id unless CORS exposes it); the header is a fallback.
  const headers = (response.headers || {}) as Record<string, unknown>;
  const rawRequestId = typeof data.requestId === "string" && data.requestId ? data.requestId : headers["x-request-id"];
  const requestId = typeof rawRequestId === "string" ? rawRequestId.slice(0, 8) : "";
  const parts = [`HTTP ${response.status}`, code, requestId ? `ref ${requestId}` : ""].filter(Boolean);
  return `${message} [${parts.join(" · ")}]`;
}
