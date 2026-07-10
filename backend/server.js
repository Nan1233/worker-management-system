const express = require("express");
const cors = require("cors");
require("dotenv").config();

require("./config/db");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

app.get("/", (req, res) => {
    res.json({ message: "Backend is running..." });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

const workerRoutes = require("./routes/workerRoutes");

app.use("/api/workers", workerRoutes);