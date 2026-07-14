import { useState } from "react";
import { useNavigate } from "react-router-dom";


import {
    getApprovedReportsByDate
} from "../../services/productionService";


import type {
    ProductionReport
} from "../../types/production";


import "./Reports.css";



function ApprovedReports(){


    const navigate = useNavigate();



    const [date,setDate] =
        useState("");



    const [reports,setReports] =
        useState<ProductionReport[]>([]);



    const [loading,setLoading] =
        useState(false);







    // ==========================
    // LỌC THEO NGÀY
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
                await getApprovedReportsByDate(
                    date
                );



            setReports(data);



        }
        catch(err){


            console.error(err);


            alert(
                "Không lấy được dữ liệu"
            );


        }
        finally{


            setLoading(false);


        }


    };








    return (

        <div className="manager-dashboard">



            <div className="manager-header">


                <h1>

                    ✅ Báo cáo đã duyệt

                </h1>


                <p>

                    Xem và kiểm tra báo cáo sản xuất đã được duyệt

                </p>


            </div>







            <div className="report-card">



                <div className="date-filter">



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
                            handleSearch
                        }

                    >

                        🔍 Xem dữ liệu

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
                            Chi tiết
                        </th>


                    </tr>


                    </thead>





                    <tbody>


                    {
                        reports.map(

                            report=>(


                            <tr

                                key={
                                    report.id
                                }

                            >



                                <td>


                                    <b>
                                        {
                                            report.worker_code
                                        }
                                    </b>


                                    <br/>


                                    {
                                        report.full_name
                                    }


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

                                    {
                                        report.process_name
                                    }

                                </td>






                                <td>

                                    {
                                        report.shift
                                    }

                                </td>






                                <td>

                                    {
                                        report.machine_no
                                    }

                                </td>






                                <td>

                                    {
                                        report.product_name
                                    }

                                </td>






                                <td>

                                    {
                                        report.tt_ok
                                    }

                                </td>






                                <td>

                                    {
                                        report.tt_ng
                                    }

                                </td>






                                <td>


                                    <button


                                        className="detail-btn"


                                        onClick={()=>


                                            navigate(

                                                `/manager/report/${report.id}?source=approved`

                                            )


                                        }


                                    >

                                        👁 Xem


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



export default ApprovedReports;