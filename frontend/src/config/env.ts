const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();
const developmentApiUrl = "http://127.0.0.1:10000/api";
const testCloudflareFrontendHost = "ktc-fe-test.nan978971.workers.dev";
const testCloudflareApiUrl = "https://ktc-be-test.nan978971.workers.dev/api";

function normalizeApiBaseUrl(value: string): string {
  const normalized = value.replace(/\/+$/, "");
  if (/\/api$/i.test(normalized)) return normalized;

  // The test Worker may receive VITE_API_URL as the bare Worker origin.
  // Append /api instead of throwing during module evaluation, which previously
  // stopped React from mounting and produced a completely white page.
  if (
    typeof window !== "undefined" &&
    window.location.hostname === testCloudflareFrontendHost &&
    /^https?:\/\//i.test(normalized)
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
