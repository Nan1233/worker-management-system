import { Outlet } from "react-router-dom";

import Sidebar from "../components/common/Sidebar";
import Header from "../components/common/Header";

import "./WorkerLayout.css";

function WorkerLayout() {
    return (
        <div className="layout">

            {/* Sidebar Desktop */}
            <Sidebar />

            {/* Khu vực chính */}
            <div className="main-layout">

                {/* Header */}
                <Header />

                {/* Nội dung */}
                <main className="page-content">
                    <Outlet />
                </main>

            </div>

        </div>
    );
}

export default WorkerLayout;