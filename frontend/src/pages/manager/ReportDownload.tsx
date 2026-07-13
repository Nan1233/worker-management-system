import { useState } from "react";

import {
    exportProductionExcel
} from "../../services/productionService";


import "./ReportDownload.css";



function ReportDownload(){


    const today =
        new Date()
        .toISOString()
        .split("T")[0];



    const [date,setDate] =
        useState(today);



    const [loading,setLoading] =
        useState(false);



    const handleDownload = async()=>{


        try{


            setLoading(true);



            await exportProductionExcel(
                date
            );


        }
        catch(err){


            console.error(
                "Lỗi tải báo cáo:",
                err
            );


            alert(
                "Không thể tải báo cáo"
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
                    📥 Tải báo cáo sản xuất
                </h1>



                <p>
                    Chọn ngày cần xuất báo cáo
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

                    onClick={
                        handleDownload
                    }

                    disabled={loading}

                >

                    {
                        loading
                        ?
                        "Đang tạo Excel..."
                        :
                        "📄 Tải Excel"
                    }


                </button>



            </div>


        </div>

    );

}



export default ReportDownload;