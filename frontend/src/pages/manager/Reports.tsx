import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getTempReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";

import "./Reports.css";


function Reports() {


    const navigate = useNavigate();


    const [reports, setReports] = useState<ProductionReport[]>([]);

    const [loading, setLoading] = useState(true);



    useEffect(() => {


        const loadReports = async () => {


            try {


                const data = await getTempReports();


                console.log(
                    "TEMP REPORT:",
                    data
                );


                setReports(data);



            } 
            catch(err) {


                console.error(
                    "Lỗi lấy báo cáo chờ duyệt:",
                    err
                );


            }
            finally {


                setLoading(false);


            }


        };



        loadReports();



    }, []);






    if(loading){


        return (

            <div className="manager-dashboard">


                <h2>

                    Đang tải dữ liệu...

                </h2>


            </div>

        );


    }






    return (


        <div className="manager-dashboard">



            <div className="manager-header">


                <h1>

                    📋 Báo cáo chờ duyệt

                </h1>



                <p>

                    Kiểm tra báo cáo công nhân gửi lên

                </p>



            </div>





            <div className="report-card">



            {

                reports.length === 0


                ?


                (

                    <div className="empty">


                        Chưa có báo cáo chờ duyệt


                    </div>


                )



                :



                (

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
                                Trạng thái
                            </th>


                            <th>
                                Thời gian gửi
                            </th>


                            <th>
                                Chi tiết
                            </th>


                        </tr>


                    </thead>





                    <tbody>



                    {

                        reports.map((report)=>(


                            <tr key={report.id}>


                                <td>


                                    <strong>

                                        {report.worker_code}

                                    </strong>


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


                                    <span className="status pending">


                                        {report.status}


                                    </span>


                                </td>





                                <td>


                                {

                                    report.created_at


                                    ?


                                    new Date(
                                        report.created_at
                                    )
                                    .toLocaleString(
                                        "vi-VN"
                                    )


                                    :


                                    "-"


                                }



                                </td>





                                <td>



                                    <button


                                        className="detail-btn"


                                        onClick={() =>

                                            navigate(
                                                `/manager/report/${report.id}`
                                            )

                                        }


                                    >


                                        Xem



                                    </button>



                                </td>




                            </tr>



                        ))


                    }




                    </tbody>



                </table>



                </div>


                )


            }



            </div>



        </div>


    );


}



export default Reports;