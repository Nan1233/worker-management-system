const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();
const developmentApiUrl = "http://127.0.0.1:10000/api";

function normalizeApiBaseUrl(value: string): string {
  const normalized = value.replace(/\/+$/, "");
  if (!/\/api$/i.test(normalized)) {
    throw new Error("VITE_API_URL must be the full API base URL ending in /api");
  }
  return normalized;
}

/**
 * Keep the Cloudflare test frontend isolated from production.
 * A stale VITE_API_URL on the test deployment must not silently send worker
 * reports to ktc-backend instead of the matching ktc-be-test worker.
 */
function resolveApiUrl(): string {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === "ktc-fe-test.nan978971.workers.dev") {
      return "https://ktc-be-test.nan978971.workers.dev/api";
    }
  }
  return configuredApiUrl || developmentApiUrl;
}

const resolvedApiUrl = resolveApiUrl();

if (import.meta.env.PROD && !resolvedApiUrl) {
  throw new Error("VITE_API_URL is required for production builds");
}

export const API_BASE_URL = normalizeApiBaseUrl(resolvedApiUrl);

export const REQUEST_TIMEOUT_MS = 30_000;
