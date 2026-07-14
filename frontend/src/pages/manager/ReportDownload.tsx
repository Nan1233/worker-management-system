import { useState } from "react";

import {
    exportProductionExcel,
    exportApprovedExcel
} from "../../services/productionService";

import "./ReportDownload.css";


function ReportDownload(){


    const today =
        new Date()
        .toISOString()
        .split("T")[0];



    const [pendingDate,setPendingDate] =
        useState(today);



    const [approvedDate,setApprovedDate] =
        useState(today);



    const [loadingPending,setLoadingPending] =
        useState(false);



    const [loadingApproved,setLoadingApproved] =
        useState(false);





    // ==========================
    // EXPORT CHỜ DUYỆT
    // ==========================

    const handleExportPending = async()=>{


        try{


            setLoadingPending(true);



            await exportProductionExcel(
                pendingDate
            );



        }

        catch(err){


            console.error(err);


            alert(
                "Xuất báo cáo chờ duyệt thất bại"
            );


        }

        finally{


            setLoadingPending(false);


        }


    };







    // ==========================
    // EXPORT ĐÃ DUYỆT
    // ==========================

    const handleExportApproved = async()=>{


        try{


            setLoadingApproved(true);



            await exportApprovedExcel(
                approvedDate
            );



        }

        catch(err){


            console.error(err);


            alert(
                "Xuất báo cáo đã duyệt thất bại"
            );


        }

        finally{


            setLoadingApproved(false);


        }


    };








    return (


        <div className="download-page">


            <div className="download-card">


                <h1>
                    📥 Xuất báo cáo Excel
                </h1>





                {/* =====================
                    CHỜ DUYỆT
                ===================== */}


                <div className="export-box">


                    <h3>
                        ⏳ Báo cáo chờ duyệt
                    </h3>



                    <p>
                        Xuất dữ liệu đang chờ quản lý kiểm tra
                    </p>





                    <input

                        type="date"

                        value={pendingDate}

                        onChange={
                            e =>
                            setPendingDate(
                                e.target.value
                            )
                        }

                    />





                    <button


                        onClick={
                            handleExportPending
                        }


                        disabled={loadingPending}


                    >


                        {
                            loadingPending
                            ? "⏳ Đang xuất..."
                            : "📄 Xuất Excel chờ duyệt"
                        }


                    </button>



                </div>









                {/* =====================
                    ĐÃ DUYỆT
                ===================== */}


                <div className="export-box">


                    <h3>
                        ✅ Báo cáo đã duyệt
                    </h3>



                    <p>
                        Xuất dữ liệu sản xuất chính thức
                    </p>





                    <input


                        type="date"


                        value={approvedDate}


                        onChange={
                            e =>
                            setApprovedDate(
                                e.target.value
                            )
                        }


                    />





                    <button


                        onClick={
                            handleExportApproved
                        }


                        disabled={loadingApproved}


                    >


                        {
                            loadingApproved
                            ? "⏳ Đang xuất..."
                            : "📄 Xuất Excel đã duyệt"
                        }


                    </button>



                </div>





            </div>


        </div>


    );


}


export default ReportDownload;