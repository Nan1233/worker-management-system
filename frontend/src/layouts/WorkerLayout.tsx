import { Outlet } from "react-router-dom";
import BottomNavbar from "../components/BottomNavbar";

const WorkerLayout = () => {
    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                background: "#f5f5f5"
            }}
        >
            <div
                style={{
                    flex: 1,
                    padding: "20px",
                    paddingBottom: "90px"
                }}
            >
                <Outlet />
            </div>

            <BottomNavbar />
        </div>
    );
};

export default WorkerLayout;