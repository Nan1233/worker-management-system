import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { ToastProvider } from "./components/feedback/ToastProvider";

const Router = window.ktcDesktop?.isDesktop ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ToastProvider>
            <Router>
                <App />
            </Router>
        </ToastProvider>
    </React.StrictMode>
);