import { useState } from "react";


import {
    getReports,
    exportProductionExcel
}
from "../../services/productionService";


import "./ReportDownload.css";



function ReportDownload(){


    const today =
        new Date()
        .toISOString()
        .split("T")[0];



    const [date,setDate]=
        useState(today);



    const [loading,setLoading]=
        useState(false);





    const handleDownload = async()=>{


        try{


            setLoading(true);



            // lấy dữ liệu đã duyệt
            const reports =
                await getReports();




            if(
                reports.length===0
            ){

                alert(
                    "Không có dữ liệu"
                );

                return;

            }




            // tạo summary sản phẩm

            const summaryMap:any={};



            reports.forEach(
                item=>{


                    const sp =
                    item.product_name;



                    if(!summaryMap[sp]){


                        summaryMap[sp]=0;


                    }



                    summaryMap[sp]
                    +=
                    Number(
                        item.actual_output || 0
                    );


                }

            );





            const summary =
            Object.keys(summaryMap)
            .map(
                key=>({

                    san_pham:key,

                    thuc_tich_kg:
                    summaryMap[key]

                })
            );






            await exportProductionExcel({

                data:reports,

                summary:summary

            });




        }
        catch(err){


            console.error(err);


            alert(
                "Xuất Excel thất bại"
            );


        }
        finally{


            setLoading(false);


        }



    };





return (

<div className="download-page">


<div className="download-card">


<h1>
📥 Xuất Excel Gia công
</h1>


<p>
Chọn ngày xuất báo cáo
</p>



<input

type="date"

value={date}

onChange={
e=>setDate(
e.target.value
)
}

/>



<button

onClick={handleDownload}

disabled={loading}

>


{
loading
?
"Đang tạo Excel..."
:
"📄 Xuất Excel"
}



</button>



</div>


</div>


);


}


export default ReportDownload;