import { Navigate } from "react-router-dom";
import type { User } from "../types/auth";
import { getAccessToken, getStoredUser } from "../utils/authStorage";

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
    const token = getAccessToken();
    const storedUser = getStoredUser();

    if (!token || !storedUser) {
        return <Navigate to="/login" replace />;
    }

    const user = storedUser as User;

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
