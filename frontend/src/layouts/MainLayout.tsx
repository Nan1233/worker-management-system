import {
    Outlet
} from "react-router-dom";


import "./MainLayout.css";





function MainLayout () {

    return (

        <div className="main-layout">

            <main className="main-layout-content">

                <Outlet />

            </main>


        </div>

    );

}


export default MainLayout;