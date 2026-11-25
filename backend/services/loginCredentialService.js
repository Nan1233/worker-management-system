'use strict';
const bcrypt=require('bcrypt');
const {resolveLoginAccount}=require('./loginAccountResolutionService');
async function verifyLoginCredentials(body) {
        const username =
            typeof body?.username === "string"
                ? body.username.trim()
                : "";

        const password =
            typeof body?.password === "string"
                ? body.password
                : "";

        const accessType =
            body?.access_type === "worker" ||
            body?.access_type === "management"
                ? body.access_type
                : null;

        if (!username) {
            return {status:400,payload:{
                success: false,
                message: "Vui lòng nhập mã nhân viên"
            }};
        }

        if (!process.env.JWT_SECRET) {
            console.error("Thiếu biến môi trường JWT_SECRET");

            return {status:500,payload:{
                success: false,
                message: "Cấu hình xác thực chưa hợp lệ"
            }};
        }

        const resolvedAccount = await resolveLoginAccount(username, accessType);

        if (resolvedAccount.ambiguous) {
            // Keep detailed diagnostics server-side only. Public failures must
            // not confirm whether an employee code belongs to any account.
            console.error("AUTH_ACCOUNT_AMBIGUOUS", {
                candidateCount: resolvedAccount.usernames.length
            });
        }
        if (resolvedAccount.ambiguous || !resolvedAccount.user) {
            return {status:401,payload:{
                success: false,
                code: "INVALID_CREDENTIALS",
                message: "Thông tin đăng nhập không hợp lệ"
            }};
        }

        const user = resolvedAccount.user;
        const userIsInactive = user.status !== "active";
        const workerIsInactive =
            user.role === "worker" &&
            user.worker_status !== "active";

        if (userIsInactive || workerIsInactive) {
            // Avoid revealing account status during unauthenticated login.
            return {status:401,payload:{
                success: false,
                code: "INVALID_CREDENTIALS",
                message: "Thông tin đăng nhập không hợp lệ"
            }};
        }

        /*
         * Luồng mới:
         * - Công nhân: chỉ cần mã nhân viên.
         * - Quản lý/tổ trưởng/admin: bắt buộc thêm mật khẩu.
         *
         * Nếu client cũ chưa gửi access_type, vẫn giữ cách đăng nhập
         * bằng username + password để không làm hỏng desktop cũ.
         */
        if (accessType === "worker") {
            if (user.role !== "worker") {
                return {status:401,payload:{
                    success: false,
                    code: "INVALID_CREDENTIALS",
                    message: "Thông tin đăng nhập không hợp lệ"
                }};
            }

            return {user};
        }

        if (accessType === "management") {
            if (
                !["super_admin", "admin", "admin_ops", "manager", "lead"].includes(
                    user.role
                )
            ) {
                return {status:401,payload:{
                    success: false,
                    code: "INVALID_CREDENTIALS",
                    message: "Thông tin đăng nhập không hợp lệ"
                }};
            }

            if (!password) {
                return {status:400,payload:{
                    success: false,
                    message: "Vui lòng nhập mật khẩu quản lý"
                }};
            }
        } else if (!password) {
            return {status:400,payload:{
                success: false,
                message: "Thiếu mật khẩu"
            }};
        }

        const passwordIsValid = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordIsValid) {
            return {status:401,payload:{
                success: false,
                code: "INVALID_CREDENTIALS",
                message: "Thông tin đăng nhập không hợp lệ"
            }};
        }

        return {user};
}
module.exports={verifyLoginCredentials};
