import { NavLink } from "react-router-dom";

import "./MobileNavbar.css";


function MobileNavbar(){


    return (

        <nav className="mobile-navbar">


            <NavLink to="/worker">

                <span>🏠</span>
                <small>Trang chủ</small>

            </NavLink>



            <NavLink to="/worker/process">

                <span>📝</span>
                <small>Báo cáo</small>

            </NavLink>



            <NavLink to="/worker/history">

                <span>📋</span>
                <small>Lịch sử</small>

            </NavLink>



            <NavLink to="/worker/account">

                <span>👤</span>
                <small>Tài khoản</small>

            </NavLink>


        </nav>

    );

}


export default MobileNavbar;