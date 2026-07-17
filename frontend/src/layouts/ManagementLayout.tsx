import {
    Outlet,
    useLocation,
    useNavigate
} from "react-router-dom";

import "./ManagementLayout.css";


type ManagementRole =
    | "lead"
    | "manager";


interface Props {

    role: ManagementRole;

}


interface MenuItem {

    id: string;

    label: string;

    path: string;

    icon: string;

    roles: ManagementRole[];

}


const menuItems: MenuItem[] = [

    {
        id:
            "dashboard",

        label:
            "Tổng quan",

        path:
            "",

        icon:
            "⌂",

        roles: [
            "lead",
            "manager"
        ]
    },

    {
        id:
            "reports",

        label:
            "Chờ duyệt",

        path:
            "reports",

        icon:
            "◷",

        roles: [
            "lead",
            "manager"
        ]
    },

    {
        id:
            "approved",

        label:
            "Đã duyệt",

        path:
            "approved",

        icon:
            "✓",

        roles: [
            "lead",
            "manager"
        ]
    },

    {
        id:
            "workers",

        label:
            "Công nhân",

        path:
            "workers",

        icon:
            "♙",

        roles: [
            "lead",
            "manager"
        ]
    },


    {
        id:
            "statistics",

        label:
            "Thống kê",

        path:
            "statistics",

        icon:
            "▥",

        roles: [
            "manager"
        ]
    }

];


function ManagementLayout({
    role
}: Props) {

    const navigate =
        useNavigate();


    const location =
        useLocation();


    const basePath =
        role === "lead"
            ? "/lead"
            : "/manager";


    const visibleMenuItems =
        menuItems.filter(
            (item) =>
                item.roles.includes(
                    role
                )
        );


    const getFullPath = (
        path: string
    ): string => {

        return path
            ? `${basePath}/${path}`
            : basePath;

    };


    const isActive = (
        item: MenuItem
    ): boolean => {

        const fullPath =
            getFullPath(
                item.path
            );


        if (
            item.path === ""
        ) {

            return (
                location.pathname
                ===
                basePath
            );

        }


        if (
            item.id ===
            "reports"
        ) {

            return (
                location.pathname
                ===
                `${basePath}/reports`
            );

        }


        if (
            item.id ===
            "approved"
        ) {

            return (
                location.pathname
                ===
                `${basePath}/approved`
            );

        }


        return location.pathname
            .startsWith(
                fullPath
            );

    };


    const handleLogout = () => {

        localStorage.removeItem(
            "token"
        );

        localStorage.removeItem(
            "user"
        );


        navigate(
            "/login",
            {
                replace:
                    true
            }
        );

    };


    return (

        <div className="management-layout">


            {/* =================================================
                SIDEBAR
            ================================================= */}

            <aside className="management-sidebar">

                <div className="management-brand">

                    <span className="management-brand-icon">

                        KTC

                    </span>


                    <div className="management-brand-content">

                        <strong>

                            Hệ thống sản xuất

                        </strong>


                        <small>

                            {
                                role === "lead"
                                    ? "Tổ trưởng"
                                    : "Quản lý"
                            }

                        </small>

                    </div>

                </div>


                <nav className="management-menu">

                    {
                        visibleMenuItems.map(
                            (item) => (

                                <button
                                    key={
                                        item.id
                                    }
                                    type="button"
                                    className={
                                        isActive(
                                            item
                                        )

                                            ? "management-menu-item active"

                                            : "management-menu-item"
                                    }
                                    onClick={() =>
                                        navigate(
                                            getFullPath(
                                                item.path
                                            )
                                        )
                                    }
                                >

                                    <span className="management-menu-icon">

                                        {
                                            item.icon
                                        }

                                    </span>


                                    <span className="management-menu-label">

                                        {
                                            item.label
                                        }

                                    </span>

                                </button>

                            )
                        )
                    }

                </nav>


                <button
                    type="button"
                    className="management-logout"
                    onClick={
                        handleLogout
                    }
                >

                    <span>

                        ⇥

                    </span>

                    Đăng xuất

                </button>

            </aside>


            {/* =================================================
                MAIN
            ================================================= */}

            <div className="management-main">

                <header className="management-header">

                    <div>

                        <strong>

                            {
                                role === "lead"
                                    ? "Khu vực tổ trưởng"
                                    : "Khu vực quản lý"
                            }

                        </strong>


                        <span>

                            {
                                role === "lead"

                                    ? "Xem, duyệt và xuất báo cáo sản xuất"

                                    : "Theo dõi, duyệt, sửa và thống kê báo cáo"
                            }

                        </span>

                    </div>


                    <div className="management-role-badge">

                        {
                            role === "lead"
                                ? "Tổ trưởng"
                                : "Quản lý"
                        }

                    </div>

                </header>


                <main className="management-content">

                    <Outlet />

                </main>

            </div>

        </div>

    );

}


export default ManagementLayout;