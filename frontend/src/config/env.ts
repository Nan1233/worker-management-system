const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();
const developmentApiUrl = "http://127.0.0.1:10000/api";

if (import.meta.env.PROD && !configuredApiUrl) {
  throw new Error("VITE_API_URL is required for production builds");
}

export const API_BASE_URL = (configuredApiUrl || developmentApiUrl).replace(/\/$/, "");

export const REQUEST_TIMEOUT_MS = 30_000;
