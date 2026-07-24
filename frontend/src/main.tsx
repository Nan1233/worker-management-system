import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { ToastProvider } from "./components/feedback/ToastProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ToastProvider>
            <HashRouter>
                <App />
            </HashRouter>
        </ToastProvider>
    </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").then((registration) => {
            registration.update().catch(() => undefined);
            window.setInterval(() => registration.update().catch(() => undefined), 6 * 60 * 60 * 1000);
        }).catch((error) => {
            console.warn("Không thể đăng ký PWA service worker:", error);
        });
    });
}
