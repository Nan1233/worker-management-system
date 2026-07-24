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

import WorkerLayout from "../layouts/WorkerLayout";

import ManagementLayout from "../layouts/ManagementLayout";


// =====================================================
// ADMIN
// =====================================================

import AdminDashboard from "../pages/admin/Dashboard";
import MasterData from "../pages/admin/MasterData";
import FormulaSettings from "../pages/admin/FormulaSettings";


// =====================================================
// LEAD - MANAGER DÙNG CHUNG
// =====================================================

import LeadDashboard from "../pages/lead/Dashboard";

import LeadPendingReports from "../pages/lead/PendingReports";

import LeadApprovedReports from "../pages/lead/ApprovedReports";

import LeadReportDetail from "../pages/lead/ReportDetail";




// =====================================================
// MANAGER
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
import SystemCenter from "../pages/system/SystemCenter";


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

            <Route path="/admin" element={<PrivateRoute allowedRoles={["admin"]}><ManagementLayout role="admin" /></PrivateRoute>}>
                <Route index element={<AdminDashboard />} />
                <Route path="master" element={<Navigate to="users" replace />} />
                <Route path="master/:resource" element={<MasterData />} />
                <Route path="formulas" element={<FormulaSettings />} />
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


                <Route path="master" element={<Navigate to="users" replace />} />
                <Route path="master/:resource" element={<MasterData />} />
                <Route path="formulas" element={<FormulaSettings />} />
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

    );

}


export default AppRouter;