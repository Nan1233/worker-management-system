import { useState } from "react";
import api from "../api/axios.ts";


function Login() {

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");


    const handleLogin = async () => {

        try {

            const res = await api.post(
                "/auth/login",
                {
                    username,
                    password
                }
            );


            console.log(res.data);


            localStorage.setItem(
                "token",
                res.data.token
            );


            alert(
                "Đăng nhập thành công: "
                + res.data.user.role
            );


        } catch (error) {

            console.log(error);

            alert("Sai tài khoản hoặc mật khẩu");

        }

    };


    return (
        <div>

            <h1>
                Login hệ thống
            </h1>


            <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={
                    (e) => setUsername(e.target.value)
                }
            />


            <br />


            <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={
                    (e) => setPassword(e.target.value)
                }
            />


            <br />


            <button onClick={handleLogin}>
                Đăng nhập
            </button>

        </div>
    );
}


export default Login;