import { NavLink, useNavigate } from "react-router-dom";

import "./ManagerSidebar.css";


function ManagerSidebar() {

    const navigate = useNavigate();


    return (

        <aside className="manager-sidebar">


            <div className="manager-logo">

                <h2>KTC</h2>

                <span>
                    Management System
                </span>

            </div>



            <nav className="manager-menu">


                <NavLink
                    to="/manager"
                    end
                    className={({isActive}) =>
                        isActive
                        ? "manager-menu-item active"
                        : "manager-menu-item"
                    }
                >

                    <span>📊</span>

                    <p>
                        Dashboard
                    </p>

                </NavLink>



                <NavLink
                    to="/manager/reports"
                    className={({isActive}) =>
                        isActive
                        ? "manager-menu-item active"
                        : "manager-menu-item"
                    }
                >

                    <span>📋</span>

                    <p>
                        Báo cáo sản xuất
                    </p>

                </NavLink>



                <NavLink
                    to="/manager/export"
                    className={({isActive}) =>
                        isActive
                        ? "manager-menu-item active"
                        : "manager-menu-item"
                    }
                >

                    <span>📥</span>

                    <p>
                        Tải báo cáo
                    </p>

                </NavLink>



                <NavLink
                    to="/manager/statistics"
                    className={({isActive}) =>
                        isActive
                        ? "manager-menu-item active"
                        : "manager-menu-item"
                    }
                >

                    <span>📈</span>

                    <p>
                        Thống kê
                    </p>

                </NavLink>



                <NavLink
                    to="/manager/workers"
                    className={({isActive}) =>
                        isActive
                        ? "manager-menu-item active"
                        : "manager-menu-item"
                    }
                >

                    <span>👥</span>

                    <p>
                        Nhân viên
                    </p>

                </NavLink>


            </nav>



            <button
                className="manager-logout"
                onClick={() => navigate("/login")}
            >

                🚪 Đăng xuất

            </button>


        </aside>

    );

}


export default ManagerSidebar;