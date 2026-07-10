const bcrypt = require("bcrypt");
const userModel = require("../models/userModel");
const workerModel = require("../models/workerModel");


exports.getAllUsers = (req, res) => {

    userModel.findAll((err, results) => {

        if (err) {
            return res.status(500).json({
                message: err.message
            });
        }

        res.json(results);

    });

};



exports.getUserById = (req, res) => {

    const id = req.params.id;


    userModel.findById(id, (err, results) => {

        if (err) {
            return res.status(500).json({
                message: err.message
            });
        }


        if (results.length === 0) {

            return res.status(404).json({
                message: "User không tồn tại"
            });

        }


        res.json(results[0]);

    });

};




exports.createUser = async (req, res) => {

    try {

        const {
            username,
            password,
            full_name,
            role,
            worker_code,
            phone,
            department
        } = req.body;



        if (!username || !password || !full_name || !role) {

            return res.status(400).json({
                message:"Thiếu dữ liệu"
            });

        }



        userModel.findByUsername(
            username,
            async (err, results)=>{


            if(err){

                return res.status(500).json({
                    message:err.message
                });

            }



            if(results.length > 0){

                return res.status(409).json({
                    message:"Username đã tồn tại"
                });

            }



            const hash = await bcrypt.hash(password,10);



            userModel.createUser(
                {
                    username,
                    password:hash,
                    full_name,
                    role
                },

                (err,result)=>{


                    if(err){

                        return res.status(500).json({
                            message:err.message
                        });

                    }



                    const userId = result.insertId;



                    // Nếu tạo worker thì tự động tạo bảng workers
                    if(role === "worker"){


                        workerModel.create(
                            {
                                user_id:userId,
                                worker_code: worker_code || `CN${userId}`,
                                phone: phone || null,
                                department: department || null
                            },

                            (err)=>{

                                if(err){

                                    return res.status(500).json({
                                        message:err.message
                                    });

                                }


                                return res.status(201).json({
                                    message:"Tạo worker thành công",
                                    user_id:userId
                                });

                            }
                        );


                    }else{


                        return res.status(201).json({
                            message:"Tạo người dùng thành công",
                            user_id:userId
                        });


                    }


                }
            );


        });



    } catch(error){

        return res.status(500).json({
            message:error.message
        });

    }

};