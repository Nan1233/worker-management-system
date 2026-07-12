import { Routes, Route, Navigate } from "react-router-dom";

import Login from "../pages/Login";

import PrivateRoute from "./PrivateRoute";


// Layout
import WorkerLayout from "../layouts/WorkerLayout";
import ManagerLayout from "../layouts/ManagerLayout";


// Admin
import AdminDashboard from "../pages/admin/Dashboard";


// Manager
import ManagerDashboard from "../pages/manager/Dashboard";
import Reports from "../pages/manager/Reports";
import ReportDetail from "../pages/manager/ReportDetail";
// import Statistics from "../pages/manager/Statistics";
// import Workers from "../pages/manager/Workers";


// Worker
import SelectProcess from "../pages/worker/SelectProcess";
import ProcessPage from "../pages/worker/ProcessPage";
import ProductionHistory from "../pages/worker/ProductionHistory";
import ProductionDetail from "../pages/worker/ProductionDetail";



function AppRouter() {


    return (

        <Routes>


            {/* Default */}

            <Route
                path="/"
                element={
                    <Navigate 
                        to="/login" 
                        replace 
                    />
                }
            />



            {/* Login */}

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

                    <PrivateRoute role="admin">

                        <AdminDashboard />

                    </PrivateRoute>

                }

            />







            {/* ================= MANAGER ================= */}


            <Route

                path="/manager"

                element={

                    <PrivateRoute role="manager">

                        <ManagerLayout />

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



                {/* Danh sách báo cáo */}

                <Route

                    path="reports"

                    element={

                        <Reports />

                    }

                />



                {/* Chi tiết báo cáo */}

                <Route

                    path="report/:id"

                    element={

                        <ReportDetail />

                    }

                />



                {/* Tải báo cáo */}

                <Route

                    path="export"

                    element={

                        <div>

                            <h1>
                                📥 Tải báo cáo Excel
                            </h1>

                            <p>
                                Chức năng xuất file Excel sẽ phát triển ở bước tiếp theo.
                            </p>

                        </div>

                    }

                />



                {/* Thống kê */}

                {/* <Route

                    path="statistics"

                    element={

                        <Statistics />

                    }

                /> */}



                {/* Nhân viên */}

                {/* <Route

                    path="workers"

                    element={

                        <Workers />

                    }

                /> */}


            </Route>









            {/* ================= WORKER ================= */}



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




                {/* Nhập báo cáo */}

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





                {/* Chi tiết */}

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