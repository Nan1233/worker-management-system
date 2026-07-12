import { Routes, Route, Navigate } from "react-router-dom";

import Login from "../pages/Login";
import PrivateRoute from "./PrivateRoute";

import WorkerLayout from "../layouts/WorkerLayout";

import AdminDashboard from "../pages/admin/Dashboard";
import ManagerDashboard from "../pages/manager/Dashboard";

import SelectProcess from "../pages/worker/SelectProcess";
import ProcessPage from "../pages/worker/ProcessPage";

import ProductionHistory from "../pages/worker/ProductionHistory";
import ProductionDetail from "../pages/worker/ProductionDetail";


function AppRouter() {

    return (

        <Routes>

            {/* Mặc định */}
            <Route
                path="/"
                element={
                    <Navigate to="/login" replace />
                }
            />


            {/* Login */}
            <Route
                path="/login"
                element={
                    <Login />
                }
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

                {/* Trang mặc định */}
                <Route
                    index
                    element={
                        <SelectProcess />
                    }
                />


                {/* Nhập báo cáo gia công */}
                <Route
                    path="process/:process"
                    element={
                        <ProcessPage />
                    }
                />


                {/* Danh sách báo cáo */}
                <Route
                    path="history"
                    element={
                        <ProductionHistory />
                    }
                />


                {/* Chi tiết báo cáo */}
                <Route
                    path="history/:id"
                    element={
                        <ProductionDetail />
                    }
                />


            </Route>


            {/* Không tồn tại */}
            <Route
                path="*"
                element={
                    <Navigate to="/login" replace />
                }
            />


        </Routes>

    );

}


export default AppRouter;