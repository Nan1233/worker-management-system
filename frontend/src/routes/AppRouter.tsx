import { Routes, Route, Navigate } from "react-router-dom";

import Login from "../pages/Login";

import PrivateRoute from "./PrivateRoute";

import WorkerLayout from "../layouts/WorkerLayout";

import AdminDashboard from "../pages/admin/Dashboard";
import ManagerDashboard from "../pages/manager/Dashboard";

import SelectProcess from "../pages/worker/SelectProcess";
import ProcessPage from "../pages/worker/ProcessPage";

function AppRouter() {
    return (
        <Routes>

            <Route
                path="/"
                element={<Navigate to="/login" replace />}
            />

            <Route
                path="/login"
                element={<Login />}
            />

            {/* ADMIN */}

            <Route
                path="/admin"
                element={
                    <PrivateRoute role="admin">
                        <AdminDashboard />
                    </PrivateRoute>
                }
            />

            {/* MANAGER */}

            <Route
                path="/manager"
                element={
                    <PrivateRoute role="manager">
                        <ManagerDashboard />
                    </PrivateRoute>
                }
            />

            {/* WORKER */}

            <Route
                element={
                    <PrivateRoute role="worker">
                        <WorkerLayout />
                    </PrivateRoute>
                }
            >
                <Route
                    path="/worker"
                    element={<SelectProcess />}
                />

                <Route
                    path="/worker/process/:process"
                    element={<ProcessPage />}
                />
            </Route>

            <Route
                path="*"
                element={<Navigate to="/login" replace />}
            />

        </Routes>
    );
}

export default AppRouter;