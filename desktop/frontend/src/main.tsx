import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { ToastProvider } from "./components/feedback/ToastProvider";
import DesktopErrorBoundary from "./components/feedback/DesktopErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <DesktopErrorBoundary>
            <ToastProvider>
                <HashRouter>
                <App />
            </HashRouter>
            </ToastProvider>
        </DesktopErrorBoundary>
    </React.StrictMode>
);