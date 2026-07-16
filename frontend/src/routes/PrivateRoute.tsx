import { Navigate } from "react-router-dom";
import type { User } from "../types/auth";

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
    const token = localStorage.getItem("token");
    const userString = localStorage.getItem("user");

    if (!token || !userString) {
        return <Navigate to="/login" replace />;
    }

    let user: User | null = null;

    try {
        user = JSON.parse(userString) as User;
    } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
    }

    if (!user) {
        return <Navigate to="/login" replace />;
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
