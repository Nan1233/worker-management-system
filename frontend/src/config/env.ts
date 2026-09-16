const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();
const developmentApiUrl = "http://127.0.0.1:10000/api";
const testCloudflareFrontendHost = "ktc-fe-test.nan978971.workers.dev";
const testCloudflareApiUrl = "https://ktc-be-test.nan978971.workers.dev/api";

function normalizeApiBaseUrl(value: string): string {
  const normalized = value.replace(/\/+$/, "");
  if (/\/api$/i.test(normalized)) return normalized;

  // Cloudflare test deployment may provide the Worker origin without /api.
  // Normalize it here so the test build cannot white-screen before React mounts.
  if (
    typeof window !== "undefined" &&
    window.location.hostname === testCloudflareFrontendHost &&
    normalized === testCloudflareApiUrl.replace(/\/api$/i, "")
  ) {
    return `${normalized}/api`;
  }

  throw new Error("VITE_API_URL must be the full API base URL ending in /api");
}

const fallbackApiUrl =
  typeof window !== "undefined" &&
  window.location.hostname === testCloudflareFrontendHost
    ? testCloudflareApiUrl
    : developmentApiUrl;

if (import.meta.env.PROD && !configuredApiUrl && fallbackApiUrl === developmentApiUrl) {
  throw new Error("VITE_API_URL is required for production builds");
}

export const API_BASE_URL = normalizeApiBaseUrl(configuredApiUrl || fallbackApiUrl);

export const REQUEST_TIMEOUT_MS = 30_000;
