import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { ToastProvider } from "./components/feedback/ToastProvider";

const RouterComponent = window.ktcDesktop?.isDesktop ? HashRouter : BrowserRouter;

if (window.ktcDesktop?.isDesktop) {
    const savedToken = localStorage.getItem("token") || "";
    void window.ktcDesktop.configureAutoSync(savedToken).catch((error) => {
        console.error("DESKTOP AUTO SYNC CONFIG ERROR:", error);
    });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ToastProvider>
            <RouterComponent>
                <App />
            </RouterComponent>
        </ToastProvider>
    </React.StrictMode>
);