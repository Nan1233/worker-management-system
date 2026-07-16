const express = require("express");
const cors = require("cors");
require("dotenv").config();


// ======================
// DATABASE
// ======================

require("./config/db");



// ======================
// ROUTES
// ======================

const authRoutes = require("./routes/authRoutes");

const userRoutes = require("./routes/userRoutes");

const workerRoutes = require("./routes/workerRoutes");

const productionRoutes = require("./routes/productionRoutes");

const productionTempRoutes = require("./routes/productionTempRoutes");

const managerRoutes = require("./routes/managerRoutes");

const reportExportRoutes = require("./routes/reportExportRoutes");

const defectRoutes = require("./routes/defectRoutes");

const deductionRoutes = require("./routes/deductionRoutes");

const machineRoutes =
    require("./routes/machineRoutes");
const productStandardRoutes =
    require("./routes/productStandardRoutes");

// ======================
// APP
// ======================

const app = express();




// ======================
// CORS
// ======================

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
// API ROUTES
// ======================



// AUTH

app.use(

    "/api/auth",

    authRoutes

);




// USERS

app.use(

    "/api/users",

    userRoutes

);




// WORKERS

app.use(

    "/api/workers",

    workerRoutes

);




// PRODUCTION

app.use(

    "/api/production",

    productionRoutes

);




// TEMP REPORT
// worker gửi
// manager duyệt

app.use(

    "/api/production-temp",

    productionTempRoutes

);




// MANAGER

app.use(

    "/api/manager",

    managerRoutes

);




// EXPORT EXCEL

app.use(

    "/api/reports",

    reportExportRoutes

);




// DEFECT NG

// GET /api/processes/:id/defects

app.use(

    "/api",

    defectRoutes

);




// DEDUCTION

// GET /api/processes/:id/deductions

app.use(

    "/api",

    deductionRoutes

);





// ======================
// TEST SERVER
// ======================


app.get("/",(req,res)=>{


    res.json({

        success:true,

        message:"Backend is running..."

    });


});





// ======================
// ERROR 404
// ======================

app.use((req,res)=>{


    res.status(404).json({

        success:false,

        message:"API không tồn tại"

    });


});





// ======================
// START SERVER
// ======================


const PORT = process.env.PORT || 3000;



app.listen(PORT,()=>{


    console.log(
        `Server running at port ${PORT}`
    );


});
app.use(
    "/api/machines",
    machineRoutes
);
app.use(
    "/api/product-standards",
    productStandardRoutes
);