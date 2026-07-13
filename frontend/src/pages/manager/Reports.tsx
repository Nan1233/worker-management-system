import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
    getTempReportsByDate,
    approveTempByDate
} from "../../services/productionService";

import type {
    ProductionReport
} from "../../types/production";

import "./Reports.css";



function Reports(){


    const navigate = useNavigate();



    const [date,setDate] =
        useState("");



    const [reports,setReports] =
        useState<ProductionReport[]>([]);



    const [loading,setLoading] =
        useState(false);






    // ==========================
    // LẤY DỮ LIỆU THEO NGÀY
    // ==========================

    const handleSearch = async()=>{


        if(!date){

            alert(
                "Vui lòng chọn ngày"
            );

            return;

        }



        try{


            setLoading(true);



            const data =
                await getTempReportsByDate(
                    date
                );



            setReports(data);



        }
        catch(err){


            console.error(
                err
            );


            alert(
                "Không lấy được dữ liệu"
            );


        }
        finally{


            setLoading(false);


        }


    };








    // ==========================
    // DUYỆT TOÀN BỘ NGÀY
    // ==========================


    const handleApprove = async()=>{


        if(
            reports.length===0
        ){

            return;

        }




        const confirm =
            window.confirm(
                `Duyệt toàn bộ ${date}?`
            );



        if(!confirm)
            return;




        try{


            await approveTempByDate(
                date
            );



            alert(
                "Duyệt thành công"
            );



            setReports([]);



        }
        catch(err){


            console.error(err);


            alert(
                "Duyệt thất bại"
            );


        }


    };







    return (


        <div className="manager-dashboard">



            <div className="manager-header">


                <h1>

                    📋 Duyệt báo cáo sản xuất

                </h1>


                <p>

                    Chọn ngày để xem và duyệt dữ liệu

                </p>


            </div>






            <div className="report-card">



                <div className="date-filter">


                    <input

                        type="date"

                        value={date}

                        onChange={
                            e =>
                            setDate(
                                e.target.value
                            )
                        }

                    />



                    <button

                        onClick={
                            handleSearch
                        }

                    >

                        🔍 Xem dữ liệu

                    </button>





                    <button

                        onClick={
                            handleApprove
                        }

                        disabled={
                            reports.length===0
                        }

                    >

                        ✅ Duyệt ngày


                    </button>



                </div>








                {
                    loading

                    ?

                    <h3>
                        Đang tải...
                    </h3>


                    :



                    reports.length===0


                    ?


                    <div className="empty">

                        Chưa có dữ liệu

                    </div>



                    :



                    <div className="table-container">


                    <table>


                    <thead>

                    <tr>


                        <th>
                            Nhân viên
                        </th>


                        <th>
                            Ngày
                        </th>


                        <th>
                            Công đoạn
                        </th>


                        <th>
                            Ca
                        </th>


                        <th>
                            Máy
                        </th>


                        <th>
                            Sản phẩm
                        </th>


                        <th>
                            OK
                        </th>


                        <th>
                            NG
                        </th>


                        <th>
                            Sửa
                        </th>


                    </tr>


                    </thead>





                    <tbody>


                    {
                        reports.map(
                            report=>(


                            <tr
                                key={report.id}
                            >



                                <td>

                                    <b>
                                        {report.worker_code}
                                    </b>

                                    <br/>

                                    {report.full_name}

                                </td>





                                <td>


                                {
                                    new Date(
                                        report.work_date
                                    )
                                    .toLocaleDateString(
                                        "vi-VN"
                                    )
                                }


                                </td>





                                <td>

                                    {report.process_name}

                                </td>





                                <td>

                                    {report.shift}

                                </td>





                                <td>

                                    {report.machine_no}

                                </td>





                                <td>

                                    {report.product_name}

                                </td>





                                <td>

                                    {report.tt_ok}

                                </td>





                                <td>

                                    {report.tt_ng}

                                </td>





                                <td>


                                    <button


                                        className="detail-btn"


                                        onClick={()=>


                                            navigate(
                                                `/manager/report/${report.id}`
                                            )


                                        }


                                    >

                                        ✏️ Sửa


                                    </button>



                                </td>



                            </tr>


                            )
                        )
                    }



                    </tbody>


                    </table>


                    </div>


                }



            </div>



        </div>


    );



}



export default Reports;