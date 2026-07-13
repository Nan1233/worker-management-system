import { NavLink } from "react-router-dom";

import "./MobileNavbar.css";


function MobileNavbar(){


    return (

        <nav className="mobile-navbar">



            <NavLink to="/worker">

                <span>
                    🏠
                </span>

                Dashboard

            </NavLink>





            <NavLink to="/worker">

                <span>
                    ⚙️
                </span>

                Công đoạn

            </NavLink>






            <NavLink to="/worker/history">


                <span>
                    📋
                </span>


                Lịch sử


            </NavLink>





            <NavLink to="/worker/account">


                <span>
                    👤
                </span>


                Tài khoản


            </NavLink>




        </nav>

    );

}


export default MobileNavbar;