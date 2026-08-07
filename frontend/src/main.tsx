import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import "./styles/ktc-professional.css";
import { ToastProvider } from "./components/feedback/ToastProvider";
import AuthBootstrap from "./components/AuthBootstrap";
import { FRONTEND_VERSION, FRONTEND_COMMIT_SHA } from "./config/version";

if (/\/login\/?$/.test(window.location.pathname)) {
    const route = window.location.hash || "#/login";
    window.history.replaceState(null, "", `${window.location.origin}/${route}`);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ToastProvider>
            <AuthBootstrap>
                <HashRouter>
                    <App />
                </HashRouter>
            </AuthBootstrap>
        </ToastProvider>
    </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD && /^https?:$/.test(window.location.protocol)) {
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
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (controllerReloaded || sessionStorage.getItem("ktc_sw_reloaded") === FRONTEND_VERSION) return;
    controllerReloaded = true;
    sessionStorage.setItem("ktc_sw_reloaded", FRONTEND_VERSION);
    window.dispatchEvent(new CustomEvent("ktc:update-available"));
    window.location.reload();
  });
}
