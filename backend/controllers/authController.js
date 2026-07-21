const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const userModel = require("../models/userModel");



exports.login = (req,res)=>{


    const {
        username,
        password
    } = req.body;



    if(!username || !password){

        return res.status(400).json({

            message:"Thiếu username hoặc password"

        });

    }




    userModel.findByUsername(
    username,
    async(err,results)=>{


        if(err){

            return res.status(500).json({

                message:"Không thể đăng nhập lúc này"

            });

        }



        if(results.length===0){

            return res.status(401).json({

                message:"Sai tài khoản hoặc mật khẩu"

            });

        }



        const user=results[0];


        // Khóa ở bảng users áp dụng cho mọi vai trò.
        // Với công nhân, trạng thái workers cũng phải đang hoạt động.
        if (user.status !== "active" || (user.role === "worker" && user.worker_status !== "active")) {

            return res.status(403).json({

                message:"Tài khoản đã bị khóa. Vui lòng liên hệ quản lý"

            });

        }


        const check =
        await bcrypt.compare(
            password,
            user.password
        );



        if(!check){

            return res.status(401).json({

                message:"Sai tài khoản hoặc mật khẩu"

            });

        }






        const token =
        jwt.sign(

        {

            id:user.id,

            worker_id:user.worker_id,

            username:user.username,

            role:user.role

        },


        process.env.JWT_SECRET,


        {

            expiresIn:"1d"

        });



        res.json({

            message:"Đăng nhập thành công",


            token,


            user:{

                id:user.id,

                worker_id:user.worker_id,

                username:user.username,

                full_name:user.full_name,

                role:user.role

            }


        });



    });



};