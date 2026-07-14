const { google } = require("googleapis");

const ReportService = require("./reportService");
const GoogleSheetModel = require("../models/googleSheetModel");



// =============================
// GOOGLE AUTH FROM RENDER ENV
// =============================

const credentials = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT
);



const auth = new google.auth.GoogleAuth({

    credentials,

    scopes:[
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]

});




// =============================
// SYNC GOOGLE SHEET
// =============================

exports.syncProductionReport = async(date)=>{


    try{


        const reports =
        await ReportService.getApprovedReportsByDate(date);



        const client =
        await auth.getClient();



        const sheets =
        google.sheets({

            version:"v4",

            auth:client

        });



        let sheetInfo =
        await GoogleSheetModel.findByDate(date);



        let spreadsheetId;



        // =================================
        // CHƯA CÓ SHEET -> TẠO MỚI
        // =================================

        if(!sheetInfo){


            const create =
            await sheets.spreadsheets.create({


                requestBody:{


                    properties:{


                        title:
                        `Bao cao cat long ${date}`


                    },



                    sheets:[

                        {

                            properties:{


                                title:"Cắt lồng"


                            }

                        }

                    ]


                }


            });



            spreadsheetId =
            create.data.spreadsheetId;



            const url =
            `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;



            await GoogleSheetModel.create({


                report_date:date,

                spreadsheet_id:spreadsheetId,

                spreadsheet_url:url


            });



        }

        else{


            spreadsheetId =
            sheetInfo.spreadsheet_id;


        }






        // =============================
        // DATA
        // =============================


        const values=[


            [

                "STT",

                "Mã CN",

                "Tên CN",

                "Công đoạn",

                "Ngày",

                "Ca",

                "Máy",

                "Sản phẩm",

                "SL chuẩn",

                "SL thực tế",

                "OK",

                "NG",

                "Trạng thái",

                "Ghi chú"

            ]

        ];





        reports.forEach((item,index)=>{


            values.push([


                index+1,

                item.worker_code,

                item.full_name,

                item.process_name,

                item.work_date,

                item.shift,

                item.machine_no,

                item.product_name,

                item.standard_output,

                item.actual_output,

                item.tt_ok,

                item.tt_ng,

                item.status,

                item.note || ""


            ]);


        });






        // =============================
        // XÓA DATA CŨ
        // =============================


        await sheets.spreadsheets.values.clear({


            spreadsheetId,


            range:"Cắt lồng!A1:Z1000"


        });






        // =============================
        // GHI DATA MỚI
        // =============================


        await sheets.spreadsheets.values.update({


            spreadsheetId,


            range:"Cắt lồng!A1",


            valueInputOption:"RAW",


            requestBody:{


                values


            }


        });





        return {


            spreadsheetId,


            url:
            `https://docs.google.com/spreadsheets/d/${spreadsheetId}`


        };



    }

    catch(err){


        console.error(
            "Google Sheet Sync Error:",
            err
        );


        throw err;


    }


};

// =====================================================
// CREATE GOOGLE SHEET MỚI
// =====================================================

exports.createSheet = async(date)=>{


    const reports =
    await ReportService.getApprovedReportsByDate(date);



    const client =
    await auth.getClient();



    const sheets =
    google.sheets({

        version:"v4",

        auth:client

    });




    const create =
    await sheets.spreadsheets.create({


        requestBody:{


            properties:{


                title:
                `Bao cao cat long ${date}`


            },


            sheets:[

                {

                    properties:{


                        title:"Cắt lồng"


                    }

                }

            ]


        }


    });




    const spreadsheetId =
    create.data.spreadsheetId;




    const url =
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;



    await GoogleSheetModel.create({


        report_date:date,

        spreadsheet_id:spreadsheetId,

        spreadsheet_url:url


    });




    await writeSheetData(

        sheets,

        spreadsheetId,

        reports

    );




    return {


        spreadsheetId,

        url


    };


};






// =====================================================
// UPDATE GOOGLE SHEET CŨ
// =====================================================

exports.updateSheet = async(date)=>{


    const sheetInfo =
    await GoogleSheetModel.findByDate(date);



    if(!sheetInfo){


        throw new Error(
            "Chưa có Google Sheet ngày này"
        );


    }




    const reports =
    await ReportService.getApprovedReportsByDate(date);



    const client =
    await auth.getClient();



    const sheets =
    google.sheets({

        version:"v4",

        auth:client

    });




    await writeSheetData(

        sheets,

        sheetInfo.spreadsheet_id,

        reports

    );





    return {


        spreadsheetId:
        sheetInfo.spreadsheet_id,


        url:
        sheetInfo.spreadsheet_url


    };


};






// =====================================================
// GHI DATA CHUNG
// =====================================================

const writeSheetData = async(

    sheets,

    spreadsheetId,

    reports

)=>{



    const values=[


        [

            "STT",

            "Mã CN",

            "Tên CN",

            "Công đoạn",

            "Ngày",

            "Ca",

            "Máy",

            "Sản phẩm",

            "SL chuẩn",

            "SL thực tế",

            "OK",

            "NG",

            "Trạng thái",

            "Ghi chú"

        ]

    ];





    reports.forEach((item,index)=>{


        values.push([


            index+1,

            item.worker_code,

            item.full_name,

            item.process_name,

            item.work_date,

            item.shift,

            item.machine_no,

            item.product_name,

            item.standard_output,

            item.actual_output,

            item.tt_ok,

            item.tt_ng,

            item.status,

            item.note || ""


        ]);


    });





    await sheets.spreadsheets.values.clear({


        spreadsheetId,


        range:"Cắt lồng!A1:Z1000"


    });





    await sheets.spreadsheets.values.update({


        spreadsheetId,


        range:"Cắt lồng!A1",


        valueInputOption:"RAW",


        requestBody:{


            values


        }


    });


};
