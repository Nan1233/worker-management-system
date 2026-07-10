const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            message: "Chưa có token"
        });
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
        return res.status(401).json({
            message: "Sai định dạng token"
        });
    }

    const token = parts[1];

    try {

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = decoded;

        next();

    } catch (error) {

        console.log("JWT ERROR:", error.message);
        console.log("JWT_SECRET hiện tại:", process.env.JWT_SECRET);

        return res.status(403).json({
            message: error.message
        });

    }

};

module.exports = verifyToken;