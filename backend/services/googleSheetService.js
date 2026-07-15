const { google } = require("googleapis");

const ReportService = require("./reportService");


// =====================================================
// GOOGLE AUTH
// =====================================================

const credentials = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT
);


const auth = new google.auth.GoogleAuth({

    credentials,

    scopes:[
        "https://www.googleapis.com/auth/spreadsheets"
    ]

});



// =====================================================
// GOOGLE SHEET
// =====================================================

const spreadsheetId =
process.env.GOOGLE_SPREADSHEET_ID;


const SHEET_NAME = "Cắt lồng";




// =====================================================
// SYNC
// =====================================================

exports.syncProductionReport = async(date)=>{


    try{


        const reports =
        await ReportService.getApprovedReportsByDate(date);



        console.log(
            "========== GOOGLE SHEET =========="
        );


        console.log(
            "REPORT COUNT:",
            reports.length
        );



        const client =
        await auth.getClient();



        const sheets =
        google.sheets({

            version:"v4",

            auth:client

        });



        await writeSheetData(
            sheets,
            reports
        );



        return {

            spreadsheetId,

            url:
            `https://docs.google.com/spreadsheets/d/${spreadsheetId}`

        };


    }
    catch(err){


        console.error(
            "GOOGLE SHEET ERROR",
            err
        );


        throw err;


    }


};





exports.createSheet = async(date)=>{

    return await exports.syncProductionReport(date);

};




exports.updateSheet = async(date)=>{

    return await exports.syncProductionReport(date);

};







// =====================================================
// READ SHEET
// =====================================================

const getSheetData = async(sheets)=>{


    const result =
    await sheets.spreadsheets.values.get({


        spreadsheetId,


        range:
        `${SHEET_NAME}!A:AZ`


    });



    return result.data.values || [];

};









// =====================================================
// WRITE DATA
// GIỮ NGUYÊN CÔNG THỨC FILE MẪU
// =====================================================

const writeSheetData = async(

    sheets,

    reports

)=>{


    if(!reports || reports.length===0){

        throw new Error(
            "Không có dữ liệu approved"
        );

    }



    const oldData =
    await getSheetData(sheets);



    console.log(
        "CURRENT ROW:",
        oldData.length
    );




    // map mã nhân viên cột B

    const employeeMap={};



    oldData.forEach((row,index)=>{


        if(index===0)
            return;



        const code =
        row[1];


        if(code){

            employeeMap[code]=index+1;

        }


    });







    for(const item of reports){



        let rowNumber =
        employeeMap[item.worker_code];



        // không có mã thì thêm cuối

        if(!rowNumber){


            rowNumber =
            oldData.length + 1;



            console.log(
                "ADD ROW",
                item.worker_code,
                rowNumber
            );


        }
        else{


            console.log(
                "UPDATE",
                item.worker_code,
                rowNumber
            );

        }






        // =================================================
        // CHỈ GHI CÁC CỘT NHẬP LIỆU
        // KHÔNG ĐỤNG CÔNG THỨC
        // =================================================


        const updateCells=[


            // B - Mã nhân viên

            {
                range:`${SHEET_NAME}!B${rowNumber}`,
                value:item.worker_code
            },


            // D - số máy

            {
                range:`${SHEET_NAME}!D${rowNumber}`,
                value:item.machine_no || ""
            },


            // E - ca

            {
                range:`${SHEET_NAME}!E${rowNumber}`,
                value:item.shift || ""
            },


            // AA - sản phẩm

            {
                range:`${SHEET_NAME}!AA${rowNumber}`,
                value:item.product_name || ""
            },


            // AB - định mức

            {
                range:`${SHEET_NAME}!AB${rowNumber}`,
                value:item.standard_output || ""
            },


            // AF - OK

            {
                range:`${SHEET_NAME}!AF${rowNumber}`,
                value:item.tt_ok || 0
            },


            // AG - tổng NG

            {
                range:`${SHEET_NAME}!AG${rowNumber}`,
                value:item.tt_ng || 0
            },


            // AD - ngày

            {
                range:`${SHEET_NAME}!AD${rowNumber}`,
                value:item.work_date || ""
            }


        ];







        for(const cell of updateCells){



            await sheets.spreadsheets.values.update({


                spreadsheetId,


                range:
                cell.range,


                valueInputOption:"RAW",


                requestBody:{


                    values:[

                        [
                            cell.value
                        ]

                    ]

                }


            });



        }




        // STT cột A
        // chỉ điền nếu dòng mới


        if(!employeeMap[item.worker_code]){


            await sheets.spreadsheets.values.update({


                spreadsheetId,


                range:
                `${SHEET_NAME}!A${rowNumber}`,

                valueInputOption:"RAW",


                requestBody:{


                    values:[

                        [
                            rowNumber-1
                        ]

                    ]

                }


            });


        }



    }





    console.log(
        "GOOGLE SHEET UPDATE SUCCESS"
    );


};