import {
    Routes,
    Route,
    Navigate
} from "react-router-dom";


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




                {/* dashboard */}

                <Route

                    index

                    element={

                        <ManagerDashboard />

                    }

                />





                {/* danh sách báo cáo chờ duyệt */}

                <Route

                    path="reports"

                    element={

                        <Reports />

                    }

                />





                {/* chi tiết báo cáo chờ duyệt */}

                <Route

                    path="report/:id"

                    element={

                        <ReportDetail />

                    }

                />






                <Route

                    path="export"

                    element={


                        <div>


                            <h1>
                                📥 Xuất Excel
                            </h1>


                            <p>
                                Chức năng đang phát triển
                            </p>


                        </div>


                    }

                />



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





                {/* dashboard worker */}

                <Route

                    index

                    element={

                        <SelectProcess />

                    }

                />







                {/* chọn công đoạn */}

                <Route

                    path="process/:process"

                    element={

                        <ProcessPage />

                    }

                />








                {/* lịch sử worker */}

                <Route

                    path="history"

                    element={

                        <ProductionHistory />

                    }

                />








                {/* chi tiết lịch sử worker */}

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