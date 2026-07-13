import { Outlet } from "react-router-dom";

import Header from "../components/common/Header";
import ManagerSidebar from "../components/common/ManagerSidebar";
import MobileNavbar from "../components/common/MobileNavbar";

import "./ManagerLayout.css";


function ManagerLayout(){


    return (


        <div className="manager-layout">


            <ManagerSidebar />



            <div className="manager-main">


                <Header />



                <main className="manager-content">

                    <Outlet />

                </main>



            </div>



            <MobileNavbar />


        </div>


    );


}


export default ManagerLayout;