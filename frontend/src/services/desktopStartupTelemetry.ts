import { API_BASE_URL } from "../config/env";

type Snapshot = {
  schema: number;
  startedAt: string;
  version: string;
  portable: boolean;
  bundledFrontend: boolean;
  platform: string;
  arch: string;
  points: Record<string, number>;
};

type DesktopBridge = Window & {
  ktcDesktop?: {
    isDesktop?: boolean;
    getStartupDiagnostics?: () => Promise<Snapshot>;
  };
};

const INSTALL_KEY = "ktc:startup-diagnostics-install-id-v1";

function installId(): string {
  const stored = localStorage.getItem(INSTALL_KEY);
  if (stored && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(stored)) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem(INSTALL_KEY, id);
  return id;
}

// Called AFTER window.load and two animation frames, never during first paint.
// One best-effort unauthenticated POST; no token, cookies, retry timer or report data.
export async function uploadDesktopStartupTelemetry(): Promise<void> {
  const bridge = (window as DesktopBridge).ktcDesktop;
  if (!bridge?.isDesktop || typeof bridge.getStartupDiagnostics !== "function") return;
  try {
    const snapshot = await bridge.getStartupDiagnostics();
    const payload = {
      installId: installId(),
      schema: snapshot.schema,
      startedAt: snapshot.startedAt,
      version: snapshot.version,
      portable: snapshot.portable,
      bundledFrontend: snapshot.bundledFrontend,
      platform: snapshot.platform,
      arch: snapshot.arch,
      points: snapshot.points,
    };
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3500);
    try {
      await fetch(`${API_BASE_URL}/system/desktop-startup/anonymous`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "omit",
        cache: "no-store",
        keepalive: false,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeout);
    }
  } catch {
    // Telemetry must never interrupt app startup, login or production reports.
  }
}
