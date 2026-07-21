import axios from "axios";


const api = axios.create({

    baseURL:
        import.meta.env.VITE_API_URL
        ||
        "https://worker-management-system-2-5jqv.onrender.com/api",

    headers: {
        "Content-Type": "application/json"
    }

});


api.interceptors.request.use(

    (config) => {

        const token =
            localStorage.getItem("token");


        if (token) {

            config.headers.Authorization =
                `Bearer ${token}`;

        }


        return config;

    },

    (error) => {

        return Promise.reject(error);

    }

);


api.interceptors.response.use(

    (response) => response,

    (error) => {

        if (
            error.response?.status === 401
        ) {

            localStorage.removeItem("token");
            localStorage.removeItem("user");

            if (window.ktcDesktop?.isDesktop) {
                if (window.location.hash !== "#/login") {
                    window.location.hash = "#/login";
                }
            } else if (window.location.pathname !== "/login") {
                window.location.replace("/login");
            }

        }


        return Promise.reject(error);

    }

);


export default api;


/*
==========================
TEST LOCAL THÌ ĐỔI LẠI:

baseURL:"http://localhost:3000/api"

==========================
*/


// const api = axios.create({

//     // Render
//     baseURL:"https://worker-management-system-2-5jqv.onrender.com/api",
// // baseURL:"http://localhost:3000/api",
//     headers:{
//         "Content-Type":"application/json"
//     }

// });