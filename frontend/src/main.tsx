import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { ToastProvider } from "./components/feedback/ToastProvider";
import AuthBootstrap from "./components/auth/AuthBootstrap";
import { BUILD_VERSION, COMMIT_SHA } from "./config/version";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ToastProvider>
            <HashRouter>
                <AuthBootstrap><App /></AuthBootstrap>
            </HashRouter>
        </ToastProvider>
    </React.StrictMode>
);

console.info(`[KTC] frontendVersion=${BUILD_VERSION} commitSha=${COMMIT_SHA}`);

if ("serviceWorker" in navigator && import.meta.env.PROD && /^https?:$/.test(window.location.protocol)) {
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || sessionStorage.getItem("ktc_sw_reloaded") === BUILD_VERSION) return;
    reloading = true; sessionStorage.setItem("ktc_sw_reloaded", BUILD_VERSION);
    window.dispatchEvent(new CustomEvent("ktc:pwa-updating"));
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((registration) => {
      void registration.update();
      window.setInterval(() => void registration.update(), 60 * 60 * 1000);
    }).catch((error) => console.warn("Không thể đăng ký PWA service worker:", error));
  });
}
