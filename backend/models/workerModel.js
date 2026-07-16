const getWorkerByUserId = (user_id)=>{


    return new Promise((resolve,reject)=>{


       const sql = `

    SELECT
        w.id,
        w.user_id,
        w.worker_code,
        w.phone,
        w.department,
        w.position,
        w.training_percent,
        w.status,
        u.full_name,
        u.username,
        u.role

    FROM workers w

    JOIN users u
    ON w.user_id = u.id

    WHERE w.user_id = ?

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