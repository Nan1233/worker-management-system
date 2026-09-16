const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();
const developmentApiUrl = "http://127.0.0.1:10000/api";

function normalizeApiBaseUrl(value: string): string {
  const normalized = value.replace(/\/+$/, "");
  if (!/\/api$/i.test(normalized)) {
    throw new Error("VITE_API_URL must be the full API base URL ending in /api");
  }
  return normalized;
}

if (import.meta.env.PROD && !configuredApiUrl) {
  throw new Error("VITE_API_URL is required for production builds");
}

export const API_BASE_URL = normalizeApiBaseUrl(configuredApiUrl || developmentApiUrl);

export const REQUEST_TIMEOUT_MS = 30_000;
