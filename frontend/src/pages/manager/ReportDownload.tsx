import { useState } from "react";


import {
    exportProductionExcel,
    exportApprovedExcel,
    createGoogleSheet,
    updateGoogleSheet
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



    const [sheetDate,setSheetDate] =
        useState(today);




    const [loadingPending,setLoadingPending] =
        useState(false);



    const [loadingApproved,setLoadingApproved] =
        useState(false);



    const [loadingCreateSheet,setLoadingCreateSheet] =
        useState(false);



    const [loadingUpdateSheet,setLoadingUpdateSheet] =
        useState(false);








    // ==========================
    // EXPORT EXCEL PENDING
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
                "Xuất Excel chờ duyệt thất bại"
            );


        }
        finally{


            setLoadingPending(false);


        }


    };










    // ==========================
    // EXPORT EXCEL APPROVED
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
                "Xuất Excel đã duyệt thất bại"
            );


        }
        finally{


            setLoadingApproved(false);


        }


    };









    // ==========================
    // CREATE GOOGLE SHEET
    // ==========================


    const handleCreateSheet = async()=>{


        try{


            setLoadingCreateSheet(true);



            const result =
            await createGoogleSheet(
                sheetDate
            );



            alert(

                "Tạo Google Sheet thành công\n\n"
                +
                result.url

            );



            window.open(

                result.url,

                "_blank"

            );


        }
        catch(err){


            console.error(err);


            alert(
                "Tạo Google Sheet thất bại"
            );


        }
        finally{


            setLoadingCreateSheet(false);


        }


    };









    // ==========================
    // UPDATE GOOGLE SHEET
    // ==========================


    const handleUpdateSheet = async()=>{


        try{


            setLoadingUpdateSheet(true);



            const result =
            await updateGoogleSheet(
                sheetDate
            );



            alert(

                "Cập nhật Google Sheet thành công\n\n"
                +
                result.url

            );



            window.open(

                result.url,

                "_blank"

            );


        }
        catch(err){


            console.error(err);



            alert(

                "Cập nhật Google Sheet thất bại"

            );


        }
        finally{


            setLoadingUpdateSheet(false);


        }


    };









    return (



        <div className="download-page">


            <div className="download-card">



                <h1>
                    📥 Xuất báo cáo
                </h1>









                {/* ======================
                    EXCEL PENDING
                ====================== */}



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
                            e=>
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
                        ?
                        "⏳ Đang xuất..."
                        :
                        "📄 Xuất Excel chờ duyệt"
                    }


                    </button>


                </div>












                {/* ======================
                    EXCEL APPROVED
                ====================== */}



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
                            e=>
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
                        ?
                        "⏳ Đang xuất..."
                        :
                        "📄 Xuất Excel đã duyệt"
                    }


                    </button>



                </div>













                {/* ======================
                    GOOGLE SHEET
                ====================== */}



                <div className="export-box">


                    <h3>
                        📊 Google Sheet
                    </h3>



                    <p>
                        Tạo mới hoặc cập nhật báo cáo Google Sheet
                    </p>



                    <input

                        type="date"

                        value={sheetDate}

                        onChange={
                            e=>
                            setSheetDate(
                                e.target.value
                            )
                        }

                    />





                    <button

                        onClick={
                            handleCreateSheet
                        }

                        disabled={
                            loadingCreateSheet
                        }

                    >


                    {
                        loadingCreateSheet
                        ?
                        "⏳ Đang tạo..."
                        :
                        "📄 Tạo Sheet mới"
                    }


                    </button>





                    <button

                        onClick={
                            handleUpdateSheet
                        }

                        disabled={
                            loadingUpdateSheet
                        }

                    >


                    {
                        loadingUpdateSheet
                        ?
                        "⏳ Đang cập nhật..."
                        :
                        "🔄 Cập nhật Sheet"
                    }


                    </button>




                </div>






            </div>


        </div>


    );


}



export default ReportDownload;