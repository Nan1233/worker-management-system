import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../services/authService";
import axios from "axios";

const Login = () => {
    const navigate = useNavigate();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const data = await login(username, password);

            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));

            if (data.user.role === "admin") {
                navigate("/admin");
            } else if (data.user.role === "manager") {
                navigate("/manager");
            } else {
                navigate("/worker");
            }
        } catch (err: unknown) {

    if (axios.isAxiosError(err)) {

        setError(
            err.response?.data?.message || "Đăng nhập thất bại"
        );

    } else {

        setError("Đăng nhập thất bại");

    }

}
    };

    return (
        <div
            style={{
                width: 350,
                margin: "100px auto",
                border: "1px solid #ddd",
                padding: 20,
                borderRadius: 8,
            }}
        >
            <h2>Đăng nhập</h2>

            <form onSubmit={handleLogin}>
                <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    style={{ width: "100%", padding: 10, marginBottom: 10 }}
                />

                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ width: "100%", padding: 10, marginBottom: 10 }}
                />

                <button
                    type="submit"
                    style={{ width: "100%", padding: 10 }}
                >
                    Đăng nhập
                </button>
            </form>

            <p style={{ color: "red" }}>{error}</p>
        </div>
    );
};

export default Login;