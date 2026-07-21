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