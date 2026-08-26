import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import App from "./App";
import "./pages/worker/ProcessPage.compact.css";
import "./pages/worker/ProcessPage.polished.css";
import "./pages/worker/ProcessPage.ng-layout.css";
import "./pages/worker/ProcessPage.time-layout.css";
import "./pages/worker/ProcessPage.actions-flow.css";
import "./pages/manager/ApprovedReportsOrder.css";
import "./pages/manager/ApprovedReportsReference.css";
import "./pages/manager/ReportsPeriodFix.css";
import { ToastProvider } from "./components/feedback/ToastProvider";
import AuthBootstrap from "./components/AuthBootstrap";
import AppErrorBoundary from "./components/system/AppErrorBoundary";
import OfflineReportSync from "./components/system/OfflineReportSync";
import ExcelWorkflowTools from "./components/system/ExcelWorkflowTools";
import "./ui-polish.css";
import "./admin-worker-password-override.css";
import "./config/workerAccountPolicy";
import "./utils/reportNumberInputFix";
import { FRONTEND_VERSION, FRONTEND_COMMIT_SHA } from "./config/version";

// KTC currently uses a single enterprise-light visual system.
// Do not inherit the OS/browser dark-mode preference: several native controls
// (checkboxes/selects) otherwise become dark even when the application UI is light.
const resolvedTheme = "light";
localStorage.setItem("ktcTheme", resolvedTheme);
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
                <ExcelWorkflowTools />
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