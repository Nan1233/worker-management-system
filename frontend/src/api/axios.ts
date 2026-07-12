import axios from "axios";


const api = axios.create({

    // Render
    baseURL:"https://worker-management-system-2-5jqv.onrender.com/api",
// baseURL:"http://localhost:3000/api",
    headers:{
        "Content-Type":"application/json"
    }

});


api.interceptors.request.use((config)=>{

    const token = localStorage.getItem("token");

    if(token){
        config.headers.Authorization =
            `Bearer ${token}`;
    }

    return config;

});


export default api;


/*
==========================
TEST LOCAL THÌ ĐỔI LẠI:

baseURL:"http://localhost:3000/api"

==========================
*/