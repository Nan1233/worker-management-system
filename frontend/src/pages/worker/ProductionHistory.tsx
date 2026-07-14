import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./ProductionHistory.css";

import {
    getMyTempReports
} from "../../services/productionService";

import type {
    ProductionReport
} from "../../types/production";



function ProductionHistory(){


    const navigate = useNavigate();


    const [reports,setReports] =
        useState<ProductionReport[]>([]);


    const [loading,setLoading] =
        useState(true);






    useEffect(()=>{


        const loadReports = async()=>{


            try{


                const data =
                    await getMyTempReports();


                console.log(
                    "MY REPORTS:",
                    data
                );


                setReports(data);



            }

            catch(err){


                console.error(
                    "Lỗi lấy lịch sử:",
                    err
                );


            }

            finally{


                setLoading(false);


            }


        };



        loadReports();



    },[]);







    if(loading){


        return (

            <div className="history-page">

                <h2>
                    Đang tải dữ liệu...
                </h2>

            </div>

        );


    }







    return (


        <div className="history-page">



            <div className="history-header">


                <h1>
                    📋 Báo cáo của tôi
                </h1>


                <p>
                    Danh sách báo cáo sản xuất đã gửi
                </p>


            </div>






            <div className="report-card">



            {
                reports.length === 0


                ?


                (

                    <div className="empty">

                        Chưa có báo cáo

                    </div>

                )



                :



                (

                <div className="table-container">


                    <table className="history-table">


                        <thead>


                            <tr>


                                <th>
                                    STT
                                </th>


                                <th>
                                    Ngày
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
                                    Chi tiết
                                </th>


                            </tr>


                        </thead>





                        <tbody>


                        {

                            reports.map((item,index)=>(


                                <tr key={item.id}>


                                    <td>

                                        {index + 1}

                                    </td>




                                    <td>

                                    {
                                        new Date(
                                            item.work_date
                                        )
                                        .toLocaleDateString(
                                            "vi-VN"
                                        )
                                    }

                                    </td>





                                    <td>

                                        {item.shift}

                                    </td>





                                    <td>

                                        {item.machine_no}

                                    </td>





                                    <td>

                                        {item.product_name}

                                    </td>





                                    <td>

                                        {item.tt_ok}

                                    </td>





                                    <td>

                                        {item.tt_ng}

                                    </td>





                                    <td>


                                        <span className="status pending">


                                            {
                                                item.status ||
                                                "pending"
                                            }


                                        </span>


                                    </td>






                                    <td>


                                        <button


                                            className="detail-btn"


                                            onClick={()=>{


                                                if(item.id){


                                                    navigate(
 `/worker/history/${item.id}?source=${item.source}`
);


                                                }


                                            }}


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



export default ProductionHistory;