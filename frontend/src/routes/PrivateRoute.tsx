import { Navigate } from "react-router-dom";
import type { User } from "../types/auth";

type Role = User["role"];

interface PrivateRouteProps {
    children: React.ReactNode;
    allowedRoles: Role[];
}

const homeByRole: Record<Role, string> = {
    admin: "/manager",
    manager: "/manager",
    lead: "/manager",
    worker: "/worker",
};

const PrivateRoute = ({ children, allowedRoles }: PrivateRouteProps) => {
    const token = localStorage.getItem("token");
    const userString = localStorage.getItem("user");

    if (!token || !userString) {
        return <Navigate to="/login" replace />;
    }

    try {
        const user = JSON.parse(userString) as User;

        if (!allowedRoles.includes(user.role)) {
            return <Navigate to={homeByRole[user.role] || "/login"} replace />;
        }
    } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};

export default PrivateRoute;