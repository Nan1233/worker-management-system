import { Outlet } from "react-router-dom";

import Sidebar from "../components/common/Sidebar";
import MobileNavbar from "../components/common/MobileNavbar";
import Header from "../components/common/Header";

import "./MainLayout.css";


interface Props {
    role:string;
}


function MainLayout({role}:Props){


    return (

        <div className="layout">


            <Sidebar role={role}/>


            <div className="main-layout">


                <Header/>


                <main className="page-content">

                    <Outlet/>

                </main>


            </div>


            <MobileNavbar role={role}/>


        </div>

    );

}


export default MainLayout;