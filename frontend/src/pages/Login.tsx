import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import { login } from "../services/authService";


const Login = () => {


    const navigate = useNavigate();


    const [username, setUsername] = useState("");

    const [password, setPassword] = useState("");

    const [error, setError] = useState("");




    const handleLogin = async (
        e: React.FormEvent
    ) => {


        e.preventDefault();


        setError("");



        try {


            const data = await login(
                username,
                password
            );



            // lưu JWT

            localStorage.setItem(
                "token",
                data.token
            );



            // lưu thông tin user

            localStorage.setItem(
                "user",
                JSON.stringify(data.user)
            );




            console.log(
                "LOGIN SUCCESS:",
                data
            );




            // điều hướng theo quyền


            switch(data.user.role){


                case "admin":

                    navigate("/admin");

                    break;



                case "manager":

                    navigate("/manager");

                    break;



                case "worker":

                    navigate("/worker");

                    break;



                default:

                    navigate("/");

            }



        }

        catch(err:unknown){



            if(axios.isAxiosError(err)){



                setError(

                    err.response?.data?.message

                    ||

                    "Sai tài khoản hoặc mật khẩu"

                );



            }

            else{


                setError(
                    "Đăng nhập thất bại"
                );


            }


        }


    };




    return (

        <div

            style={{

                width:350,

                margin:"100px auto",

                border:"1px solid #ddd",

                padding:20,

                borderRadius:8

            }}

        >


            <h2>
                Đăng nhập
            </h2>




            <form
                onSubmit={handleLogin}
            >


                <input


                    type="text"


                    placeholder="Username"


                    value={username}


                    onChange={(e)=>
                        setUsername(e.target.value)
                    }


                    style={{

                        width:"100%",

                        padding:10,

                        marginBottom:10

                    }}

                />





                <input


                    type="password"


                    placeholder="Password"


                    value={password}


                    onChange={(e)=>
                        setPassword(e.target.value)
                    }


                    style={{

                        width:"100%",

                        padding:10,

                        marginBottom:10

                    }}


                />





                <button


                    type="submit"


                    style={{

                        width:"100%",

                        padding:10

                    }}


                >

                    Đăng nhập

                </button>



            </form>




            {
                error &&

                <p

                    style={{

                        color:"red"

                    }}

                >

                    {error}

                </p>

            }



        </div>

    );


};



export default Login;