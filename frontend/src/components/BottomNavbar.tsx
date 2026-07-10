import { useNavigate, useLocation } from "react-router-dom";

const BottomNavbar = () => {

    const navigate = useNavigate();
    const location = useLocation();

    const menus = [
        {
            title: "Công đoạn",
            path: "/worker"
        },
        {
            title: "Lịch sử",
            path: "/worker/history"
        },
        {
            title: "Tài khoản",
            path: "/worker/profile"
        }
    ];

    return (
        <div
            style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                height: "65px",
                background: "#ffffff",
                display: "flex",
                justifyContent: "space-around",
                alignItems: "center",
                borderTop: "1px solid #ddd",
                boxShadow: "0 -2px 8px rgba(0,0,0,.08)"
            }}
        >
            {menus.map((item) => (
                <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontSize: "15px",
                        fontWeight:
                            location.pathname === item.path
                                ? "bold"
                                : "normal",
                        color:
                            location.pathname === item.path
                                ? "#1976d2"
                                : "#555"
                    }}
                >
                    {item.title}
                </button>
            ))}
        </div>
    );
};

export default BottomNavbar;