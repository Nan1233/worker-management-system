const DEFAULT_API_URL = "https://worker-management-system-2-5jqv.onrender.com/api";

export const API_BASE_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, "");

export const REQUEST_TIMEOUT_MS = 30_000;
