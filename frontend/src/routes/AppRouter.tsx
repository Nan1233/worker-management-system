import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import PrivateRoute from "./PrivateRoute";
import WorkerLayout from "../layouts/WorkerLayout";
import ManagementLayout from "../layouts/ManagementLayout";

const Login = lazy(() => import("../pages/Login"));
const AdminDashboard = lazy(() => import("../pages/admin/Dashboard"));
const MasterData = lazy(() => import("../pages/admin/MasterData"));
const FormulaSettings = lazy(() => import("../pages/admin/FormulaSettings"));
const Governance = lazy(() => import("../pages/admin/Governance"));
const LeadDashboard = lazy(() => import("../pages/lead/Dashboard"));
const LeadPendingReports = lazy(() => import("../pages/lead/PendingReports"));
const LeadApprovedReports = lazy(() => import("../pages/lead/ApprovedReports"));
const LeadReportDetail = lazy(() => import("../pages/lead/ReportDetail"));
const ManagerEditReport = lazy(() => import("../pages/manager/EditReport"));
const ManagerStatistics = lazy(() => import("../pages/manager/Statistics"));
const SelectedReportsReview = lazy(() => import("../pages/manager/SelectedReportsReview"));
const SelectProcess = lazy(() => import("../pages/worker/SelectProcess"));
const ProcessPage = lazy(() => import("../pages/worker/ProcessPage"));
const ProductionHistory = lazy(() => import("../pages/worker/ProductionHistory"));
const ProductionDetail = lazy(() => import("../pages/worker/ProductionDetail"));
const SystemCenter = lazy(() => import("../pages/system/SystemCenter"));

// =====================================================
// ROUTER
// =====================================================

function AppRouter() {

    return (
        <Suspense fallback={<div className="route-loading">Đang tải...</div>}>
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

            <Route path="/admin" element={<PrivateRoute allowedRoles={["admin"]}><ManagementLayout role="admin" /></PrivateRoute>}>
                <Route index element={<AdminDashboard />} />
                <Route path="master" element={<Navigate to="users" replace />} />
                <Route path="master/:resource" element={<MasterData />} />
                <Route path="formulas" element={<FormulaSettings />} />
                <Route path="governance" element={<Governance />} />
                <Route path="reports" element={<LeadPendingReports />} />
                <Route path="approved" element={<LeadApprovedReports />} />
                <Route path="statistics" element={<ManagerStatistics />} />
                <Route path="system" element={<SystemCenter />} />
            </Route>


            {/* =================================================
                LEAD - TRANG CHI TIẾT KHÔNG SIDEBAR
            ================================================= */}

            <Route
                path="/lead/reports/review"
                element={

                    <PrivateRoute
                        allowedRoles={[
                            "lead"
                        ]}
                    >

                        <SelectedReportsReview />

                    </PrivateRoute>

                }
            />


            <Route
                path="/lead/report/:id"
                element={

                    <PrivateRoute
                        allowedRoles={[
                            "lead"
                        ]}
                    >

                        <LeadReportDetail />

                    </PrivateRoute>

                }
            />


            {/* =================================================
                MANAGER - TRANG CHI TIẾT KHÔNG SIDEBAR
            ================================================= */}

            <Route
                path="/manager/reports/review"
                element={

                    <PrivateRoute
                        allowedRoles={[
                            "admin",
                            "manager"
                        ]}
                    >

                        <SelectedReportsReview />

                    </PrivateRoute>

                }
            />


            <Route
                path="/manager/report/:id"
                element={

                    <PrivateRoute
                        allowedRoles={[
                            "admin",
                            "manager"
                        ]}
                    >

                        <LeadReportDetail />

                    </PrivateRoute>

                }
            />


            <Route
                path="/manager/report/:id/edit"
                element={

                    <PrivateRoute
                        allowedRoles={[
                            "admin",
                            "manager"
                        ]}
                    >

                        <ManagerEditReport />

                    </PrivateRoute>

                }
            />


            {/* =================================================
                LEAD - CÓ SIDEBAR
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
                    path="approved"
                    element={

                        <LeadApprovedReports />

                    }
                />


                <Route path="system" element={<SystemCenter />} />
            </Route>


            {/* =================================================
                MANAGER - CÓ SIDEBAR
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

                <Route
                    index
                    element={

                        <LeadDashboard />

                    }
                />
                <Route path="master" element={<Navigate to="users" replace />} />
                <Route path="master/:resource" element={<MasterData />} />
                <Route path="formulas" element={<FormulaSettings />} />
                <Route path="governance" element={<Governance />} />


                <Route
                    path="reports"
                    element={

                        <LeadPendingReports />

                    }
                />


                <Route
                    path="approved"
                    element={

                        <LeadApprovedReports />

                    }
                />


       


                <Route path="statistics" element={<ManagerStatistics />} />
                <Route path="system" element={<SystemCenter />} />

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

                        <WorkerLayout />

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


                <Route path="history/:id" element={<ProductionDetail />} />
                <Route path="system" element={<SystemCenter />} />

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
        </Suspense>
    );

}


export default AppRouter;