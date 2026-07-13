const express = require("express");
const cors = require("cors");
require("dotenv").config();


require("./config/db");



const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const workerRoutes = require("./routes/workerRoutes");
const productionRoutes = require("./routes/productionRoutes");
const productionTempRoutes = require("./routes/productionTempRoutes");
const managerRoutes = require("./routes/managerRoutes");



const app = express();





const corsOptions = {

    origin:[
        "http://localhost:5173",
        "https://worker-management-system-3-dzox.onrender.com"
    ],


    methods:[
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "OPTIONS"
    ],


    allowedHeaders:[
        "Content-Type",
        "Authorization"
    ],


    credentials:true

};



app.use(cors(corsOptions));


app.use(express.json());





// ======================
// ROUTES
// ======================


app.use(
    "/api/auth",
    authRoutes
);


app.use(
    "/api/users",
    userRoutes
);


app.use(
    "/api/workers",
    workerRoutes
);


app.use(
    "/api/production",
    productionRoutes
);


app.use(
    "/api/production-temp",
    productionTempRoutes
);


app.use(
    "/api/manager",
    managerRoutes
);






app.get("/",(req,res)=>{


    res.json({

        message:"Backend is running..."

    });


});






const PORT = process.env.PORT || 3000;



app.listen(PORT,()=>{


    console.log(
        `Server running at http://localhost:${PORT}`
    );


});
const reportExportRoutes =
require("./routes/reportExportRoutes");


app.use(
    "/api/reports",
    reportExportRoutes
);