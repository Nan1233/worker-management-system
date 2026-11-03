const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();
const developmentApiUrl = "http://127.0.0.1:10000/api";
const testApiOrigin = "https://ktc-be-test.nan978971.workers.dev";
const testFrontendHostname = "ktc-fe-test.nan978971.workers.dev";
const productionFrontendHostname = "ktc-frontend.nan978971.workers.dev";
const isTestBuild = import.meta.env.MODE === "test";
const isProductionBuild = import.meta.env.PROD && !isTestBuild;

function normalizeApiBaseUrl(value: string): string {
  const normalized = value.replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("VITE_API_URL must be an absolute API URL");
  }
  if (!/\/api$/i.test(parsed.pathname) || parsed.search || parsed.hash) {
    throw new Error("VITE_API_URL must be the full API base URL ending in /api");
  }
  if (isTestBuild && parsed.origin !== testApiOrigin) {
    throw new Error("TEST build must use the KTC TEST API endpoint");
  }
  if (isProductionBuild && (parsed.protocol !== "https:" || parsed.hostname === "ktc-be-test.nan978971.workers.dev" || parsed.hostname.includes("-test."))) {
    throw new Error("Production build must use an HTTPS production API endpoint, never a TEST endpoint");
  }
  return normalized;
}

/**
 * Deployment isolation is enforced at build time and again in the browser:
 * TEST bundles cannot point at production; production bundles cannot point at TEST.
 */
function resolveApiUrl(): string {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    if (isProductionBuild && hostname === testFrontendHostname) {
      throw new Error("Production frontend bundle cannot run on the TEST frontend hostname");
    }
    if (isTestBuild && hostname === productionFrontendHostname) {
      throw new Error("TEST frontend bundle cannot run on the production frontend hostname");
    }
    if (hostname === testFrontendHostname && !isTestBuild) {
      throw new Error("The TEST frontend hostname requires a TEST build profile");
    }
  }
  if (configuredApiUrl) return configuredApiUrl;
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
