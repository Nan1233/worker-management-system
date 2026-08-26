import { Navigate, useLocation } from "react-router-dom";
import type { User } from "../types/auth";
import RouteLoading from "../components/system/RouteLoading";
import { isLoginTransitionActive } from "../services/api";
import { getAccessToken, getStoredUser, recoverUserFromAccessToken } from "../utils/authStorage";

type Role = User["role"];

interface PrivateRouteProps {
    children: React.ReactNode;
    allowedRoles: Role[];
}

const homeByRole: Record<Role, string> = {
    admin: "/admin",
    manager: "/manager",
    lead: "/lead",
    worker: "/worker"
};

const PrivateRoute = ({ children, allowedRoles }: PrivateRouteProps) => {
    const location = useLocation();
    const token = getAccessToken();
    const storedUser = getStoredUser() || recoverUserFromAccessToken();

    if (!token || !storedUser) {
        if (isLoginTransitionActive()) {
            return <RouteLoading />;
        }
        return <Navigate to="/login" replace />;
    }

    const user = storedUser as User;

    // Tạm thời Tổ trưởng dùng toàn bộ giao diện /manager.
    // Giữ /lead/reports, /lead/approved... cho bộ giao diện Tổ trưởng riêng về sau;
    // chỉ trang gốc /lead được chuyển sang giao diện dùng chung hiện tại.
    if (user.role === "lead" && location.pathname === "/lead") {
        return <Navigate to="/manager" replace />;
    }

    if (!allowedRoles.includes(user.role)) {
        return (
            <Navigate
                to={homeByRole[user.role] || "/login"}
                replace
            />
        );
    }

    return <>{children}</>;
};

export default PrivateRoute;
