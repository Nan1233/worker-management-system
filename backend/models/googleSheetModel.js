const db = require("../config/db");


const GoogleSheet = {



    // tìm sheet theo ngày

    findByDate(date){

        return new Promise((resolve,reject)=>{


            db.query(

                `
                SELECT *

                FROM google_sheets

                WHERE report_date=?

                `,

                [date],

                (err,result)=>{


                    if(err)
                        return reject(err);


                    resolve(result[0]);

                }

            );


        });

    },





    // lưu sheet mới


    create(data){


        return new Promise((resolve,reject)=>{


            db.query(

                `
                INSERT INTO google_sheets

                (
                    report_date,
                    spreadsheet_id,
                    spreadsheet_url
                )

                VALUES (?,?,?)

                `,


                [

                    data.report_date,

                    data.spreadsheet_id,

                    data.spreadsheet_url

                ],


                (err,result)=>{


                    if(err)
                        return reject(err);



                    resolve(result);


                }


            );


        });


    }



};



module.exports = GoogleSheet;