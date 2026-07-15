const getWorkerByUserId = (user_id)=>{


    return new Promise((resolve,reject)=>{


        const sql=`

        SELECT

        w.id,

        w.worker_code,

        u.full_name AS worker_name


        FROM workers w


        JOIN users u

        ON w.user_id=u.id


        WHERE w.user_id=?


        `;



        db.query(

            sql,

            [user_id],

            (err,result)=>{


                if(err){

                    reject(err);

                }


                resolve(result[0]);

            }

        );


    });


};