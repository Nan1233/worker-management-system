const express = require("express");
const router = express.Router();

const userController = require("../controllers/userController");

const verifyToken = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");


// Admin + Manager xem danh sách user
router.get(
    "/",
    verifyToken,
    checkRole("admin", "manager"),
    userController.getAllUsers
);


// Admin + Manager xem chi tiết
router.get(
    "/:id",
    verifyToken,
    checkRole("admin", "manager"),
    userController.getUserById
);


// Chỉ Admin tạo user
router.post(
    "/",
    verifyToken,
    checkRole("admin"),
    userController.createUser
);


module.exports = router;