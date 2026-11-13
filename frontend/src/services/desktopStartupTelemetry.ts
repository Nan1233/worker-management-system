import api from "./api";
import { getAccessToken } from "../utils/authStorage";

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

type DesktopTelemetryBridge = Window & {
  ktcDesktop?: {
    isDesktop?: boolean;
    getStartupDiagnostics?: () => Promise<Snapshot>;
  };
};

const INSTALL_KEY = "ktc:startup-diagnostics-install-id-v1";

function installId(): string {
  const stored = localStorage.getItem(INSTALL_KEY);
  if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem(INSTALL_KEY, id);
  return id;
}

// Passive, best-effort startup upload; never blocks login or opening the app.
// Retry only while waiting for the user to sign in or for a temporary network
// outage. Send an opaque per-install UUID, never hostname/token/log file.
export function startDesktopStartupTelemetry(): () => void {
  const bridge = (window as DesktopTelemetryBridge).ktcDesktop;
  if (!bridge?.isDesktop || typeof bridge.getStartupDiagnostics !== "function") return () => {};

  let stopped = false;
  let inFlight = false;
  let uploaded = false;
  let attempts = 0;
  let errors = 0;

  const upload = async () => {
    if (stopped || uploaded || inFlight || attempts >= 60 || errors >= 5) return;
    attempts += 1;
    if (!getAccessToken()) return;
    inFlight = true;
    try {
      const snapshot = await bridge.getStartupDiagnostics!();
      if (stopped) return;
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
      await api.post("/system/desktop-startup", payload, { timeout: 8000 });
      uploaded = true;
    } catch {
      errors += 1;
      // No user-visible error: diagnostic traffic must never affect production.
    } finally {
      inFlight = false;
    }
  };

  const timer = window.setInterval(() => {
    if (uploaded || attempts >= 60 || errors >= 5) window.clearInterval(timer);
    else void upload();
  }, 4000);
  void upload();
  return () => { stopped = true; window.clearInterval(timer); };
}
