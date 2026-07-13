import { Outlet } from "react-router-dom";

import Sidebar from "../components/common/Sidebar";
import Header from "../components/common/Header";
import MobileNavbar from "../components/common/MobileNavbar";

import "./WorkerLayout.css";


function WorkerLayout() {


    return (


        <div className="layout">


            <Sidebar />



            <div className="main-layout">


                <Header />



                <main className="page-content">

                    <Outlet />

                </main>


            </div>



            <MobileNavbar />


        </div>


    );


}


export default WorkerLayout;