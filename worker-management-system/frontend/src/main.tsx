import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import "./styles/ktc-professional.css";
import "./styles/app-shell.css";
import "./styles/production/production-ui.css";
import "./styles/enterprise-responsive.css";
import "./styles/release-polish.css";
import "./styles/pilot-ui-polish.css";
import "./styles/demo-polish.css";
import "./styles/ktc-edge-to-edge.css";
import "./styles/worker-final-ui.css";
import "./styles/light-contrast-hardening.css";
import "./styles/interaction-hardening.css";
import "./styles/management-layout-failsafe.css";
import "./styles/worker-form-redesign.css";
import "./styles/ktc-web-redesign.css";
import "./styles/notification-ui-hardening.css";
import "./styles/final-demo-ui.css";
import "./styles/demo-ui-overhaul.css";
import { ToastProvider } from "./components/feedback/ToastProvider";
import AuthBootstrap from "./components/AuthBootstrap";
import AppErrorBoundary from "./components/system/AppErrorBoundary";
import OfflineReportSync from "./components/system/OfflineReportSync";
import { FRONTEND_VERSION, FRONTEND_COMMIT_SHA } from "./config/version";

const initialTheme = localStorage.getItem("ktcTheme");
const resolvedTheme = initialTheme === "dark" || initialTheme === "light"
    ? initialTheme
    : window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
document.documentElement.dataset.theme = resolvedTheme;
document.documentElement.style.colorScheme = resolvedTheme;

const isNativeCapacitor = Boolean(
    (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
);

if (/\/login\/?$/.test(window.location.pathname)) {
    const route = window.location.hash || "#/login";
    window.history.replaceState(null, "", `${window.location.origin}/${route}`);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AppErrorBoundary>
            <ToastProvider>
                <OfflineReportSync />
                <AuthBootstrap>
                    <HashRouter>
                        <App />
                    </HashRouter>
                </AuthBootstrap>
            </ToastProvider>
        </AppErrorBoundary>
    </React.StrictMode>
);

if (!isNativeCapacitor && "serviceWorker" in navigator && import.meta.env.PROD && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
            registration.update().catch(() => undefined);
            window.setInterval(() => registration.update().catch(() => undefined), 6 * 60 * 60 * 1000);
        }).catch((error) => {
            console.warn("Không thể đăng ký PWA service worker:", error);
        });
    });
}

console.info(`[KTC] frontendVersion=${FRONTEND_VERSION} commitSha=${FRONTEND_COMMIT_SHA}`);

let controllerReloaded = false;
if (!isNativeCapacitor && "serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (controllerReloaded || sessionStorage.getItem("ktc_sw_reloaded") === FRONTEND_VERSION) return;
    controllerReloaded = true;
    sessionStorage.setItem("ktc_sw_reloaded", FRONTEND_VERSION);
    window.dispatchEvent(new CustomEvent("ktc:update-available"));
    window.location.reload();
  });
}
