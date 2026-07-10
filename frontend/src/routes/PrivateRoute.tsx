import { Navigate } from "react-router-dom";

interface PrivateRouteProps {
    children: React.ReactNode;
    role: string;
}

const PrivateRoute = ({ children, role }: PrivateRouteProps) => {

    const token = localStorage.getItem("token");

    const userString = localStorage.getItem("user");

    if (!token || !userString) {
        return <Navigate to="/login" replace />;
    }

    const user = JSON.parse(userString);

    if (user.role !== role) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};

export default PrivateRoute;