import { useEffect, useState } from "react";

import {
    getApprovedReports
} from "../../services/productionService";

import type {
    ProductionReport
} from "../../types/production";


function ApprovedReports(){


    const [reports,setReports] =
        useState<ProductionReport[]>([]);


    const [loading,setLoading] =
        useState(true);



    useEffect(()=>{


        const loadData = async()=>{


            try{


                const data =
                    await getApprovedReports();


                setReports(data);


            }
            catch(err){


                console.error(
                    "Lỗi lấy báo cáo đã duyệt",
                    err
                );


            }
            finally{


                setLoading(false);


            }


        };


        loadData();


    },[]);




    if(loading){

        return (

            <h2>
                Đang tải dữ liệu...
            </h2>

        );

    }



    return (

        <div className="manager-dashboard">


            <div className="manager-header">

                <h1>
                    ✅ Báo cáo đã duyệt
                </h1>

            </div>




            {
                reports.length===0

                ?

                <div className="empty">

                    Chưa có báo cáo

                </div>


                :


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
                                OK
                            </th>

                            <th>
                                NG
                            </th>

                        </tr>

                    </thead>



                    <tbody>


                    {
                        reports.map(item=>(


                            <tr key={item.id}>


                                <td>

                                    {item.full_name}

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

                                    {item.process_name}

                                </td>



                                <td>

                                    {item.tt_ok}

                                </td>



                                <td>

                                    {item.tt_ng}

                                </td>


                            </tr>


                        ))
                    }


                    </tbody>


                </table>


            }


        </div>

    );

}


export default ApprovedReports;