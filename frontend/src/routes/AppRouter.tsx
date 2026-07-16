import {
    Routes,
    Route,
    Navigate
} from "react-router-dom";


import Login from "../pages/Login";

import PrivateRoute from "./PrivateRoute";


// Layout

import MainLayout from "../layouts/MainLayout";



// Admin

import AdminDashboard from "../pages/admin/Dashboard";



// Manager

import ManagerDashboard from "../pages/manager/Dashboard";

import Reports from "../pages/manager/Reports";

import ApprovedReports from "../pages/manager/ApprovedReports";

import ReportDetail from "../pages/manager/ReportDetail";

import ReportDownload from "../pages/manager/ReportDownload";



// Worker

import SelectProcess from "../pages/worker/SelectProcess";

import ProcessPage from "../pages/worker/ProcessPage";

import ProductionHistory from "../pages/worker/ProductionHistory";

import ProductionDetail from "../pages/worker/ProductionDetail";



function AppRouter(){


    return (

        <Routes>



            {/* DEFAULT */}

            <Route

                path="/"

                element={

                    <Navigate

                        to="/login"

                        replace

                    />

                }

            />





            {/* LOGIN */}

            <Route

                path="/login"

                element={

                    <Login />

                }

            />







            {/* ================= ADMIN ================= */}


            <Route

                path="/admin"

                element={

                    <PrivateRoute allowedRoles={["admin"]}>

                        <AdminDashboard />

                    </PrivateRoute>

                }

            />








{/* ================= MANAGER ================= */}


<Route

    path="/manager"

    element={

        <PrivateRoute allowedRoles={["admin", "manager", "lead"]}>

            <MainLayout role={JSON.parse(localStorage.getItem("user") || "{}").role || "manager"}/>

        </PrivateRoute>

    }

>


    {/* Dashboard */}

    <Route

        index

        element={

            <ManagerDashboard />

        }

    />





    {/* Báo cáo chưa duyệt */}

    <Route

        path="reports"

        element={

            <Reports />

        }

    />





    {/* Báo cáo đã duyệt */}

    <Route

        path="approved"

        element={

            <ApprovedReports />

        }

    />





    {/* Chi tiết báo cáo */}

    <Route

        path="report/:id"

        element={

            <ReportDetail />

        }

    />





    {/* Export Excel */}

    <Route

        path="export"

        element={

            <ReportDownload />

        }

    />


</Route>


            {/* ================= WORKER ================= */}



            <Route

                path="/worker"

                element={

                    <PrivateRoute allowedRoles={["worker"]}>

                        <MainLayout role="worker"/>

                    </PrivateRoute>

                }

            >




                {/* Dashboard worker */}

                <Route

                    index

                    element={

                        <SelectProcess />

                    }

                />






                {/* Chọn công đoạn */}

                <Route

                    path="process/:process"

                    element={

                        <ProcessPage />

                    }

                />








                {/* Lịch sử */}

                <Route

                    path="history"

                    element={

                        <ProductionHistory />

                    }

                />







                {/* Chi tiết lịch sử */}

                <Route

                    path="history/:id"

                    element={

                        <ProductionDetail />

                    }

                />



            </Route>








            {/* NOT FOUND */}

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