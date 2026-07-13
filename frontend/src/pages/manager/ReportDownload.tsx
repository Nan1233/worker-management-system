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
                "Lỗi tải Excel:",
                err
            );


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
                        e=>
                        setDate(
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

                        "📄 Xuất Excel"

                    }


                </button>



            </div>


        </div>


    );


}


export default ReportDownload;