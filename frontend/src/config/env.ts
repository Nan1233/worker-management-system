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
 * Test frontend is permanently isolated from production.
 * Never allow a stale VITE_API_URL in the deployed test build to send
 * requests to the production backend.
 */
function resolveApiUrl(): string {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === "ktc-fe-test.nan978971.workers.dev") {
      return "https://ktc-be-test.nan978971.workers.dev/api";
    }
  }
  if (configuredApiUrl) return configuredApiUrl;
  // A production bundle without VITE_API_URL used to silently call http://127.0.0.1:10000,
  // which can never work for a real user. Fail loudly instead; local dev keeps its default.
  if (import.meta.env.PROD) return "";
  return developmentApiUrl;
}

const resolvedApiUrl = resolveApiUrl();

if (import.meta.env.PROD && !resolvedApiUrl) {
  throw new Error("VITE_API_URL is required for production builds");
}

export const API_BASE_URL = normalizeApiBaseUrl(resolvedApiUrl);

export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Where users get the KTC Desktop app (needed to build/update Excel workbooks).
 * Defaults to the GitHub releases page of the repository configured as the
 * electron-builder publish target in desktop/package.json.
 */
export const DESKTOP_DOWNLOAD_URL =
    String(import.meta.env.VITE_DESKTOP_DOWNLOAD_URL || "").trim() ||
    "https://github.com/Nan1233/worker-management-system/releases/latest";
