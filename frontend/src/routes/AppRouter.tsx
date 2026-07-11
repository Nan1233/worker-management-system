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
            {/* Mặc định */}
            <Route
                path="/"
                element={<Navigate to="/login" replace />}
            />

            {/* Login */}
            <Route
                path="/login"
                element={<Login />}
            />

            {/* Admin */}
            <Route
                path="/admin"
                element={
                    <PrivateRoute role="admin">
                        <AdminDashboard />
                    </PrivateRoute>
                }
            />

            {/* Manager */}
            <Route
                path="/manager"
                element={
                    <PrivateRoute role="manager">
                        <ManagerDashboard />
                    </PrivateRoute>
                }
            />

            {/* Worker */}
            <Route
                path="/worker"
                element={
                    <PrivateRoute role="worker">
                        <WorkerLayout />
                    </PrivateRoute>
                }
            >
                {/* Trang mặc định sau khi đăng nhập */}
                <Route
                    index
                    element={<SelectProcess />}
                />

                {/* Form nhập báo cáo */}
                <Route
                    path="process/:process"
                    element={<ProcessPage />}
                />

                {/* Sau này thêm */}
                {/* <Route path="history" element={<ProductionHistory />} /> */}
                {/* <Route path="profile" element={<ProfilePage />} /> */}
            </Route>

            {/* Không tồn tại */}
            <Route
                path="*"
                element={<Navigate to="/login" replace />}
            />
        </Routes>
    );
}

export default AppRouter;