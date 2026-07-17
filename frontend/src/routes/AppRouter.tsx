import {
    Navigate,
    Route,
    Routes
} from "react-router-dom";


import Login from "../pages/Login";

import PrivateRoute from "./PrivateRoute";


// =====================================================
// LAYOUT
// =====================================================

import MainLayout from "../layouts/MainLayout";

import ManagementLayout from "../layouts/ManagementLayout";


// =====================================================
// ADMIN
// =====================================================

import AdminDashboard from "../pages/admin/Dashboard";


// =====================================================
// LEAD - CÁC TRANG NGHIỆP VỤ DÙNG CHUNG
//
// Manager cũng sử dụng lại các trang này.
// =====================================================

import LeadDashboard from "../pages/lead/Dashboard";

import LeadPendingReports from "../pages/lead/PendingReports";

import LeadApprovedReports from "../pages/lead/ApprovedReports";

import LeadReportDetail from "../pages/lead/ReportDetail";

import LeadWorkers from "../pages/lead/Workers";

import LeadReportDownload from "../pages/lead/ReportDownload";


// =====================================================
// MANAGER - CHỨC NĂNG RIÊNG
// =====================================================

import ManagerEditReport from "../pages/manager/EditReport";

import ManagerStatistics from "../pages/manager/Statistics";

import SelectedReportsReview from "../pages/manager/SelectedReportsReview";


// =====================================================
// WORKER
// =====================================================

import SelectProcess from "../pages/worker/SelectProcess";

import ProcessPage from "../pages/worker/ProcessPage";

import ProductionHistory from "../pages/worker/ProductionHistory";

import ProductionDetail from "../pages/worker/ProductionDetail";


// =====================================================
// ROUTER
// =====================================================

function AppRouter() {

    return (

        <Routes>


            {/* =================================================
                DEFAULT
            ================================================= */}

            <Route
                path="/"
                element={

                    <Navigate
                        to="/login"
                        replace
                    />

                }
            />


            {/* =================================================
                LOGIN
            ================================================= */}

            <Route
                path="/login"
                element={

                    <Login />

                }
            />


            {/* =================================================
                ADMIN
            ================================================= */}

            <Route
                path="/admin"
                element={

                    <PrivateRoute
                        allowedRoles={[
                            "admin"
                        ]}
                    >

                        <AdminDashboard />

                    </PrivateRoute>

                }
            />


            {/* =================================================
                LEAD
                - Xem báo cáo
                - Duyệt báo cáo
                - Xem báo cáo đã duyệt
                - Xem công nhân
                - Xuất Excel / Sheet
                - Không sửa báo cáo
            ================================================= */}

            <Route
                path="/lead"
                element={

                    <PrivateRoute
                        allowedRoles={[
                            "lead"
                        ]}
                    >

                        <ManagementLayout
                            role="lead"
                        />

                    </PrivateRoute>

                }
            >

                <Route
                    index
                    element={

                        <LeadDashboard />

                    }
                />


                <Route
                    path="reports"
                    element={

                        <LeadPendingReports />

                    }
                />


                <Route
                    path="reports/review"
                    element={

                        <SelectedReportsReview />

                    }
                />


                <Route
                    path="approved"
                    element={

                        <LeadApprovedReports />

                    }
                />


                <Route
                    path="report/:id"
                    element={

                        <LeadReportDetail />

                    }
                />


                <Route
                    path="workers"
                    element={

                        <LeadWorkers />

                    }
                />


                <Route
                    path="export"
                    element={

                        <LeadReportDownload />

                    }
                />

            </Route>


            {/* =================================================
                MANAGER
                - Dùng lại toàn bộ trang lead
                - Có thêm sửa báo cáo
                - Có thêm thống kê
            ================================================= */}

            <Route
                path="/manager"
                element={

                    <PrivateRoute
                        allowedRoles={[
                            "admin",
                            "manager"
                        ]}
                    >

                        <ManagementLayout
                            role="manager"
                        />

                    </PrivateRoute>

                }
            >

                {/* Dùng chung Dashboard của lead */}

                <Route
                    index
                    element={

                        <LeadDashboard />

                    }
                />


                {/* Dùng chung danh sách chờ duyệt */}

                <Route
                    path="reports"
                    element={

                        <LeadPendingReports />

                    }
                />


                {/* Xem chi tiết nhiều báo cáo đã chọn */}

                <Route
                    path="reports/review"
                    element={

                        <SelectedReportsReview />

                    }
                />


                {/* Dùng chung danh sách đã duyệt */}

                <Route
                    path="approved"
                    element={

                        <LeadApprovedReports />

                    }
                />


                {/* Dùng chung trang chi tiết */}

                <Route
                    path="report/:id"
                    element={

                        <LeadReportDetail />

                    }
                />


                {/* Dùng chung danh sách công nhân */}

                <Route
                    path="workers"
                    element={

                        <LeadWorkers />

                    }
                />


                {/* Dùng chung trang xuất báo cáo */}

                <Route
                    path="export"
                    element={

                        <LeadReportDownload />

                    }
                />


                {/* Chỉ manager/admin được sửa */}

                <Route
                    path="report/:id/edit"
                    element={

                        <ManagerEditReport />

                    }
                />


                {/* Chỉ manager/admin có thống kê */}

                <Route
                    path="statistics"
                    element={

                        <ManagerStatistics />

                    }
                />

            </Route>


            {/* =================================================
                WORKER
            ================================================= */}

            <Route
                path="/worker"
                element={

                    <PrivateRoute
                        allowedRoles={[
                            "worker"
                        ]}
                    >

                        <MainLayout />

                    </PrivateRoute>

                }
            >

                <Route
                    index
                    element={

                        <SelectProcess />

                    }
                />


                <Route
                    path="process/:process"
                    element={

                        <ProcessPage />

                    }
                />


                <Route
                    path="history"
                    element={

                        <ProductionHistory />

                    }
                />


                <Route
                    path="history/:id"
                    element={

                        <ProductionDetail />

                    }
                />

            </Route>


            {/* =================================================
                NOT FOUND
            ================================================= */}

            <Route
                path="*"
                element={

                    <Navigate
                        to="/login"
                        replace
                    />

                }
            />

        </Routes>

    );

}


export default AppRouter;